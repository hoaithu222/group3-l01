import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import type { ResolvedAccess } from "../../../core/permission";
import { AppError, ConflictError, NotFoundError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify, registerNotificationType } from "../../notifications/public";
import type { IChannelRepository } from "../repositories/channel.repository.interface";
import type { IChannelGrantRepository } from "../repositories/channel-grant.repository.interface";
import type { IChannelMembershipRepository } from "../repositories/channel-membership.repository.interface";
import type { Channel } from "../entities/channel.interface";
import type { ArchiveChannelDto, RestoreChannelDto } from "../dtos";
import { computeChannelActions, invalidateChannelMetaCache } from "./channel-permission.resolver";
import { isGrantRoleRef } from "../../../core/constants/role-coverage";
import { loadRoleCoveredMembers } from "./channel-role-audience";
import { toChannelDetail, type ChannelDetail } from "./channel.presenter";

const auditService = new AuditService();

// Side-effect lúc import — thông báo cho grantee còn lại khi kênh riêng tư bị
// tự động lưu trữ vì hết người quản lý (be.md §5.8).
registerNotificationType({
  type: "channel.archived-notice",
  inbox: true,
  inboxFilter: "all",
  pushType: null,
  androidChannel: "default",
  priority: 2,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "channel.read",
});

/** `archive/restore` (be.md §5.3) — `orphanCheck` dùng bởi `jobs/channel-orphan-check.job.ts` (be.md §5.8). */
export class ChannelLifecycleService {
  constructor(
    private readonly channelRepo: IChannelRepository,
    private readonly membershipRepo: IChannelMembershipRepository,
    private readonly grantRepo: IChannelGrantRepository
  ) {}

  async archive(actorId: string, channelId: string, dto: ArchiveChannelDto): Promise<ChannelDetail> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();

    let replacement: Channel | null = null;
    if (channel.isDefault) {
      replacement = dto.replacementDefaultChannelId
        ? await this.channelRepo.findById(dto.replacementDefaultChannelId)
        : null;
      if (
        !replacement ||
        replacement.workspaceId !== channel.workspaceId ||
        replacement.id === channel.id ||
        replacement.type !== "TEXT" ||
        replacement.visibility !== "PUBLIC" ||
        replacement.status !== "ACTIVE"
      ) {
        throw new AppError(ErrorMessages[ErrorCode.CH_005], 409, ErrorCode.CH_005);
      }
    }

    const replacementId = replacement?.id;
    const updated = await withTransaction(async (tx) => {
      const result = await tx.channel.updateMany({
        where: { id: channelId, version: dto.expectedVersion, status: "ACTIVE" },
        data: { status: "ARCHIVED", archiveReason: "MANUAL", archivedAt: new Date(), archivedBy: actorId, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const current = await tx.channel.findUnique({ where: { id: channelId } });
        if (!current) throw new NotFoundError();
        if (current.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.CH_004], 403, ErrorCode.CH_004);
        throw new VersionConflictError(current.version);
      }

      if (replacementId) {
        await tx.channel.update({ where: { id: replacementId }, data: { isDefault: true } });
        await tx.workspace.update({
          where: { id: channel.workspaceId },
          data: { defaultChannelId: replacementId, version: { increment: 1 } },
        });
      }

      const updatedChannel = await tx.channel.findUniqueOrThrow({ where: { id: channelId } });

      await outbox.add(tx, {
        type: "channel.archived",
        aggregateType: "Channel",
        aggregateId: channelId,
        queue: "notifications",
        jobName: "channel.events",
        dedupeKey: `channel.archived:${channelId}:v${updatedChannel.version}`,
        payload: {
          event: "status-changed",
          channelId,
          workspaceId: channel.workspaceId,
          status: "ARCHIVED",
          archiveReason: "MANUAL",
          replacementDefaultChannelId: replacementId,
        },
      });

      if (replacementId) {
        await outbox.add(tx, {
          type: "channel.default-backfill",
          aggregateType: "Channel",
          aggregateId: replacementId,
          queue: "cron",
          jobName: "channel.default-backfill",
          dedupeKey: `channel.default-backfill:channel:${replacementId}`,
          payload: { channelId: replacementId, workspaceId: channel.workspaceId },
        });
      }

      return updatedChannel as unknown as Channel;
    });

    await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
    await invalidateChannelMetaCache(channelId);
    if (replacementId) await invalidateChannelMetaCache(replacementId);

    await auditService.record({
      actorId,
      action: "channel.archive",
      targetType: "Channel",
      targetId: channelId,
      workspaceId: channel.workspaceId,
      reason: "MANUAL",
    });

    return this.toDetail(updated, actorId);
  }

  async restore(actorId: string, channelId: string, dto: RestoreChannelDto): Promise<ChannelDetail> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    if (channel.status === "ACTIVE") {
      throw new ConflictError("Kênh đang hoạt động, không cần khôi phục");
    }
    if (channel.archiveReason !== "MANUAL") {
      throw new AppError(ErrorMessages[ErrorCode.CH_007], 403, ErrorCode.CH_007);
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: channel.workspaceId }, select: { status: true } });
    if (!workspace || workspace.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
    }

    const updated = await withTransaction(async (tx) => {
      const result = await tx.channel.updateMany({
        where: { id: channelId, version: dto.expectedVersion, status: "ARCHIVED" },
        data: { status: "ACTIVE", archiveReason: null, archivedAt: null, archivedBy: null, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const current = await tx.channel.findUnique({ where: { id: channelId } });
        if (!current) throw new NotFoundError();
        throw new VersionConflictError(current.version);
      }

      const updatedChannel = await tx.channel.findUniqueOrThrow({ where: { id: channelId } });

      await outbox.add(tx, {
        type: "channel.restored",
        aggregateType: "Channel",
        aggregateId: channelId,
        queue: "notifications",
        jobName: "channel.events",
        dedupeKey: `channel.restored:${channelId}:v${updatedChannel.version}`,
        payload: {
          event: "status-changed",
          channelId,
          workspaceId: channel.workspaceId,
          status: "ACTIVE",
          archiveReason: null,
        },
      });

      return updatedChannel as unknown as Channel;
    });

    await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
    await invalidateChannelMetaCache(channelId);

    await auditService.record({
      actorId,
      action: "channel.restore",
      targetType: "Channel",
      targetId: channelId,
      workspaceId: channel.workspaceId,
    });

    return this.toDetail(updated, actorId);
  }

  /**
   * `POST /admin/channels/:channelId/archive` (be.md §4) — chỉ áp dụng kênh
   * PUBLIC (`CH_012` với PRIVATE, đúng nguyên tắc "không thao tác cấp nền
   * tảng trên kênh riêng tư"). Route admin KHÔNG gửi `replacementDefaultChannelId`
   * nên kênh mặc định luôn bị chặn `CH_005` ở đây — admin muốn đổi kênh mặc
   * định trước, chủ nhóm/quản lý mới archive được qua route thường.
   */
  async platformArchive(adminId: string, channelId: string, reason: string): Promise<Channel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    if (channel.visibility !== "PUBLIC") {
      throw new AppError(ErrorMessages[ErrorCode.CH_012], 403, ErrorCode.CH_012);
    }
    if (channel.isDefault) {
      throw new AppError(ErrorMessages[ErrorCode.CH_005], 409, ErrorCode.CH_005);
    }

    const updated = await withTransaction(async (tx) => {
      const result = await tx.channel.updateMany({
        where: { id: channelId, status: "ACTIVE" },
        data: { status: "ARCHIVED", archiveReason: "PLATFORM", archivedAt: new Date(), archivedBy: adminId, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const current = await tx.channel.findUnique({ where: { id: channelId } });
        if (!current) throw new NotFoundError();
        if (current.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.CH_004], 403, ErrorCode.CH_004);
      }

      const updatedChannel = await tx.channel.findUniqueOrThrow({ where: { id: channelId } });

      await outbox.add(tx, {
        type: "channel.archived",
        aggregateType: "Channel",
        aggregateId: channelId,
        queue: "notifications",
        jobName: "channel.events",
        dedupeKey: `channel.archived:${channelId}:v${updatedChannel.version}`,
        payload: { event: "status-changed", channelId, workspaceId: channel.workspaceId, status: "ARCHIVED", archiveReason: "PLATFORM" },
      });

      return updatedChannel as unknown as Channel;
    });

    await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
    await invalidateChannelMetaCache(channelId);
    await auditService.record({
      actorId: adminId,
      action: "channel.platform-archive",
      targetType: "Channel",
      targetId: channelId,
      workspaceId: channel.workspaceId,
      reason,
    });

    return updated;
  }

  /** `POST /admin/channels/:channelId/restore` — chỉ áp dụng kênh PUBLIC (`CH_012`); admin bỏ qua ràng buộc "chỉ khôi phục MANUAL" (be.md §5.3) của route thường. */
  async platformRestore(adminId: string, channelId: string, reason: string): Promise<Channel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    if (channel.visibility !== "PUBLIC") {
      throw new AppError(ErrorMessages[ErrorCode.CH_012], 403, ErrorCode.CH_012);
    }
    if (channel.status === "ACTIVE") {
      throw new ConflictError("Kênh đang hoạt động, không cần khôi phục");
    }

    const updated = await withTransaction(async (tx) => {
      const result = await tx.channel.updateMany({
        where: { id: channelId, status: "ARCHIVED" },
        data: { status: "ACTIVE", archiveReason: null, archivedAt: null, archivedBy: null, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const current = await tx.channel.findUnique({ where: { id: channelId } });
        if (!current) throw new NotFoundError();
      }

      const updatedChannel = await tx.channel.findUniqueOrThrow({ where: { id: channelId } });

      await outbox.add(tx, {
        type: "channel.restored",
        aggregateType: "Channel",
        aggregateId: channelId,
        queue: "notifications",
        jobName: "channel.events",
        dedupeKey: `channel.restored:${channelId}:v${updatedChannel.version}`,
        payload: { event: "status-changed", channelId, workspaceId: channel.workspaceId, status: "ACTIVE", archiveReason: null },
      });

      return updatedChannel as unknown as Channel;
    });

    await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
    await invalidateChannelMetaCache(channelId);
    await auditService.record({
      actorId: adminId,
      action: "channel.platform-restore",
      targetType: "Channel",
      targetId: channelId,
      workspaceId: channel.workspaceId,
      reason,
    });

    return updated;
  }

  /** be.md §5.8 — CAS ACTIVE→ARCHIVED(NO_MANAGER) khi kênh riêng tư hết người quản lý. Trả `true` nếu vừa lưu trữ (idempotent — job retry an toàn). */
  async orphanCheck(channelId: string): Promise<boolean> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.status !== "ACTIVE" || channel.visibility !== "PRIVATE") return false;

    const managerCount = await this.grantRepo.countManagers(channelId);
    if (managerCount > 0) return false;

    const archived = await withTransaction(async (tx) => {
      const result = await tx.channel.updateMany({
        where: { id: channelId, status: "ACTIVE" },
        data: { status: "ARCHIVED", archiveReason: "NO_MANAGER", archivedAt: new Date(), archivedBy: null, version: { increment: 1 } },
      });
      if (result.count === 0) return null;

      const updatedChannel = await tx.channel.findUniqueOrThrow({ where: { id: channelId } });

      await outbox.add(tx, {
        type: "channel.orphaned",
        aggregateType: "Channel",
        aggregateId: channelId,
        queue: "notifications",
        jobName: "channel.events",
        dedupeKey: `channel.orphaned:${channelId}:v${updatedChannel.version}`,
        payload: {
          event: "status-changed",
          channelId,
          workspaceId: channel.workspaceId,
          status: "ARCHIVED",
          archiveReason: "NO_MANAGER",
        },
      });

      const remainingGrants = await tx.channelGrant.findMany({
        where: { channelId },
        select: { userId: true, source: true, roleRef: true },
      });
      // Người đọc được nhờ grant theo vai trò (p3-04) cũng nhận thông báo kênh bị lưu trữ.
      const roleRefs = remainingGrants.flatMap((g) => (g.source === "ROLE" && isGrantRoleRef(g.roleRef) ? [g.roleRef] : []));
      const viaRole = await loadRoleCoveredMembers(channel.workspaceId, roleRefs, tx);
      const noticeUserIds = Array.from(
        new Set([...remainingGrants.flatMap((g) => (g.userId ? [g.userId] : [])), ...viaRole.map((m) => m.userId)])
      );
      if (noticeUserIds.length > 0) {
        await notify(tx, {
          type: "channel.archived-notice",
          scope: { type: "CHANNEL", id: channelId },
          workspaceId: channel.workspaceId,
          source: { type: "Channel", id: channelId },
          refs: { workspaceId: channel.workspaceId, channelId, reason: "NO_MANAGER" },
          recipients: noticeUserIds.map((userId) => ({ userId })),
          dedupeKey: `channel.archived-notice:${channelId}:v${updatedChannel.version}`,
        });
      }

      return updatedChannel;
    });

    if (!archived) return false;

    await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
    await invalidateChannelMetaCache(channelId);
    return true;
  }

  /**
   * Dựng lại `ResolvedAccess` MỚI sau archive/restore thay vì tái dùng access
   * đã resolve TRƯỚC mutation (đã cũ so với `status` vừa đổi) — giống
   * `workspace-lifecycle.service.ts#afterStateChange`. Actor luôn có
   * `manage=true` ở đây (2 method gọi `toDetail` đều đã qua `requireChannelAccess("manage")`).
   */
  private async toDetail(channel: Channel, userId: string): Promise<ChannelDetail> {
    const isPrivate = channel.visibility === "PRIVATE";
    const [membership, grant] = await Promise.all([
      this.membershipRepo.find(channel.id, userId),
      isPrivate ? this.grantRepo.findDirect(channel.id, userId) : Promise.resolve(null),
    ]);
    const access: ResolvedAccess = {
      visible: true,
      role: isPrivate ? "MANAGER" : "ADMIN",
      actions: computeChannelActions({
        isPrivate,
        manage: true,
        writable: channel.status === "ACTIVE",
        postingPolicy: channel.postingPolicy,
      }),
    };
    return toChannelDetail(channel, access, membership, grant);
  }
}
