import { withTransaction } from "../../../infrastructure/database";
import { outbox, cancelJob, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { permissionService } from "../../../core/permission";
import { AppError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { AuditService } from "../../audit-log/audit-log.service";
import type { ChannelGrantChange, ChannelGrantPort } from "../../../shared/ports/channel-grant.port";
import type { IInvitationRepository } from "../repositories/invitation.repository.interface";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type { WorkspaceMembership } from "../entities/member.interface";
import type { UpdateGuestDto } from "../dtos";
import type { IGuestConfig } from "./guest-config";
import { resolveGuestPolicy } from "./invitation-rules";
import { cancelGuestExpiryInTx, guestExpireKey, guestNoticeKey, scheduleGuestExpiryInTx } from "./guest-expiry.schedule";
import { defaultChannelManageCheck, type ChannelManageCheck } from "./invitation-create.service";

const auditService = new AuditService();
const DAY_MS = 24 * 3600_000;

export interface UpdateGuestResult {
  membership: WorkspaceMembership;
  channelIds: string[];
}

/** `PATCH /workspaces/:id/members/:userId/guest` — đổi hạn và/hoặc kênh chỉ định của một khách (OWNER/ADMIN, be.md §4/§5.4). */
export class GuestService {
  constructor(
    private readonly memberships: IMembershipRepository,
    private readonly invitations: IInvitationRepository,
    private readonly channelGrant: ChannelGrantPort,
    private readonly guestConfig: IGuestConfig,
    private readonly canManageChannel: ChannelManageCheck = defaultChannelManageCheck
  ) {}

  async update(actor: AuthUser, workspaceId: string, targetUserId: string, dto: UpdateGuestDto): Promise<UpdateGuestResult> {
    const target = await this.memberships.findByWorkspaceAndUser(workspaceId, targetUserId);
    if (!target || target.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_013], 409, ErrorCode.WS_013);
    }
    if (target.role !== "GUEST") throw new ValidationError("Thành viên này không phải khách");

    const workspace = await this.invitations.findWorkspace(workspaceId);
    if (!workspace) throw new AppError(ErrorMessages[ErrorCode.WS_013], 409, ErrorCode.WS_013);
    if (workspace.status === "ARCHIVED") throw new AppError(ErrorMessages[ErrorCode.WS_002], 409, ErrorCode.WS_002);

    const version = target.expiryVersion ?? 0;
    if (dto.expectedVersion !== version) throw new VersionConflictError(version);

    const config = await this.guestConfig.load();
    const policy = resolveGuestPolicy(workspace.guestPolicy, config);
    const now = new Date();
    let expiresAt = target.expiresAt;
    if (dto.expiresAt !== undefined) {
      if (dto.expiresAt <= now) {
        throw new ValidationError("Hạn mới phải ở tương lai — hãy dùng \"loại khỏi nhóm\" để thu hồi ngay");
      }
      if (dto.expiresAt.getTime() > now.getTime() + policy.maxDays * DAY_MS) {
        throw new ValidationError(`Khách tối đa ${policy.maxDays} ngày kể từ bây giờ`);
      }
      expiresAt = dto.expiresAt;
    }
    if (!expiresAt) throw new ValidationError("Khách chưa có hạn — hãy đặt hạn mới");
    const newExpiry: Date = expiresAt;

    const current = await this.memberships.listGuestChannelIds(workspaceId, targetUserId);
    const desired = dto.channelIds ? [...new Set(dto.channelIds)] : current;
    const toAdd = desired.filter((id) => !current.includes(id));
    const toRemove = dto.channelIds ? current.filter((id) => !desired.includes(id)) : [];
    if (toAdd.length > 0) await this.assertDesignatable(actor, workspaceId, toAdd);

    const nextVersion = version + 1;
    const changes: ChannelGrantChange[] = [];
    await withTransaction(async (tx) => {
      // CAS theo `expiryVersion`: hai PATCH đồng thời chỉ một thắng (người còn lại 409 RES_003).
      const claim = await tx.workspaceMembership.updateMany({
        where: { workspaceId, userId: targetUserId, status: "ACTIVE", role: "GUEST", expiryVersion: version },
        data: { expiresAt: newExpiry, expiryVersion: nextVersion },
      });
      if (claim.count === 0) throw new VersionConflictError(version);

      if (toAdd.length > 0) {
        changes.push(await this.channelGrant.grantMemberInTx(tx, { workspaceId, userId: targetUserId, channelIds: toAdd, actorId: actor.id }));
      }
      if (toRemove.length > 0) {
        changes.push(await this.channelGrant.revokeMemberInTx(tx, { workspaceId, userId: targetUserId, channelIds: toRemove }));
      }

      await cancelGuestExpiryInTx(tx, target.id, version);
      await scheduleGuestExpiryInTx(tx, {
        membershipId: target.id,
        workspaceId,
        userId: targetUserId,
        expiresAt: newExpiry,
        expiryVersion: nextVersion,
        noticeHours: config.expiringNoticeHours,
        now,
      });
      await outbox.add(tx, {
        type: "membership.guest-updated",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${workspaceId}:${targetUserId}`,
        queue: "notifications",
        jobName: "membership.events",
        dedupeKey: `membership.guest-updated:${workspaceId}:${targetUserId}:v${nextVersion}`,
        payload: { event: "guest-updated", workspaceId, userId: targetUserId },
      });
    });

    // Sau commit: hạn đổi → làm mới cache quyền; kênh đổi → vào/rời room + thu hồi phạm vi kênh bị gỡ.
    await permissionService.bumpVersion({ type: "WORKSPACE", id: workspaceId });
    for (const change of changes) await this.channelGrant.afterCommit(change);
    await this.cancelStaleJobs(target.id, version);

    await auditService.record({
      actorId: actor.id,
      action: "guest.update",
      targetType: "WorkspaceMembership",
      targetId: `${workspaceId}:${targetUserId}`,
      workspaceId,
      metadata: {
        ...(dto.expiresAt !== undefined && { expiresAt: newExpiry.toISOString() }),
        ...(dto.channelIds && { added: toAdd.length, removed: toRemove.length }),
      },
    });

    const membership = (await this.memberships.findByWorkspaceAndUser(workspaceId, targetUserId)) as WorkspaceMembership;
    return { membership, channelIds: await this.memberships.listGuestChannelIds(workspaceId, targetUserId) };
  }

  /** Kênh THÊM MỚI: thuộc nhóm, còn hoạt động; kênh riêng tư phải do người thao tác quản lý (`CH_013`). Gỡ kênh không cần kiểm. */
  private async assertDesignatable(actor: AuthUser, workspaceId: string, channelIds: string[]): Promise<void> {
    const briefs = await this.invitations.listChannels(workspaceId, channelIds);
    const byId = new Map(briefs.map((c) => [c.id, c]));
    for (const channelId of channelIds) {
      const brief = byId.get(channelId);
      if (!brief) throw new ValidationError("Kênh chỉ định không thuộc nhóm này");
      if (brief.status !== "ACTIVE") throw new ValidationError("Kênh chỉ định đã được lưu trữ");
      if (brief.visibility === "PRIVATE" && !(await this.canManageChannel(actor, channelId))) {
        throw new AppError(ErrorMessages[ErrorCode.CH_013], 403, ErrorCode.CH_013);
      }
    }
  }

  /** Dòng outbox cũ chưa dispatch đã xoá trong tx; job đã lên BullMQ (nếu có) huỷ best-effort — processor vẫn tự kiểm version. */
  private async cancelStaleJobs(membershipId: string, version: number): Promise<void> {
    try {
      await cancelJob("cron", toSafeJobId(guestExpireKey(membershipId, version)));
      await cancelJob("notifications", toSafeJobId(guestNoticeKey(membershipId, version)));
    } catch (err) {
      logger.warn("[guest.update] Không huỷ được job hết hạn cũ (bỏ qua — job tự kiểm version)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
