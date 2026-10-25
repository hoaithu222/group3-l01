import { Prisma } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { joinRooms, leaveRooms } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { normalizeSearch } from "../../../core/utils/normalize";
import { LIMITS } from "../../../core/constants/limits";
import { MODULES, isModuleEnabled } from "../../../core/constants/modules";
import { AppError, NotFoundError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { permissionService, type ResolvedAccess } from "../../../core/permission";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify, registerNotificationType } from "../../notifications/public";
import { notifyUnreadSummaryChanged } from "../../read-state/public";
import type { IChannelRepository } from "../repositories/channel.repository.interface";
import type { IChannelMembershipRepository } from "../repositories/channel-membership.repository.interface";
import type { IChannelGrantRepository } from "../repositories/channel-grant.repository.interface";
import type { Channel, ChannelGrant, ChannelMembership } from "../entities/channel.interface";
import type { GrantRoleRef } from "../../../core/constants/role-coverage";
import { getChannelVoiceActivityReader } from "../../../shared/ports/channel-voice-activity.port";
import type { IChannelRoleAudience } from "./channel-role-audience";
import type { CreateChannelDto, UpdateChannelDto, ChannelMeDto } from "../dtos";
import { computeChannelActions, invalidateChannelMetaCache } from "./channel-permission.resolver";
import { toChannelDetail, toChannelListItem, type ChannelDetail, type ChannelListItem } from "./channel.presenter";
import { planVoiceSettingsChange, videoDisabledOutbox } from "./channel-voice-settings";

const auditService = new AuditService();

// Side-effect lúc import (giống `workspace.admin-change`/`workspace.invite-accepted`
// p1-01/p1-02) — thông báo hộp thư khi được thêm vào kênh riêng tư (be.md §5.1/§5.4).
registerNotificationType({
  type: "channel.private-added",
  inbox: true,
  inboxFilter: "all",
  pushType: null,
  androidChannel: "default",
  priority: 1,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: true,
  readAction: "channel.read",
});

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export interface ListChannelsResult {
  joined: ChannelListItem[];
  discoverable: ChannelListItem[];
}

export interface ListChannelsParams {
  include: "joined" | "discover" | "all";
  type?: Channel["type"];
  status: Channel["status"];
}

/** `create/list/get/patch/join/leave/me/searchNames` (be.md §5.1/§5.2). Archive/restore/orphan ở `channel-lifecycle.service.ts`, grant ở `channel-grant.service.ts`. */
export class ChannelService {
  constructor(
    private readonly channelRepo: IChannelRepository,
    private readonly membershipRepo: IChannelMembershipRepository,
    private readonly grantRepo: IChannelGrantRepository,
    /** p3-04 — quyền qua vai trò; không truyền → chỉ tính grant DIRECT (unit test Phase 1). */
    private readonly roles?: IChannelRoleAudience
  ) {}

  async create(actorId: string, workspaceId: string, dto: CreateChannelDto): Promise<ChannelDetail> {
    if (dto.type === "VOICE" && !isModuleEnabled(MODULES.VOICE)) {
      throw new AppError(ErrorMessages[ErrorCode.CH_010], 400, ErrorCode.CH_010);
    }
    if (dto.type === "POMODORO" && !isModuleEnabled(MODULES.POMODORO)) {
      throw new AppError(ErrorMessages[ErrorCode.CH_010], 400, ErrorCode.CH_010);
    }

    await this.requireActiveWorkspace(workspaceId);

    const activeCount = await this.channelRepo.countActive(workspaceId);
    if (activeCount >= LIMITS.channel.perWorkspaceMax) {
      throw new AppError(ErrorMessages[ErrorCode.CH_006], 409, ErrorCode.CH_006);
    }

    const normalizedName = normalizeSearch(dto.name);
    let initialMemberIds: string[] = [];
    if (dto.visibility === "PRIVATE" && dto.initialMemberIds.length > 0) {
      // Loại trùng lặp — nếu không, `tx.channelGrant.create()` thứ 2 cùng
      // userId ném P2002 (unique `[channelId,subjectKey,source]`) và bị `catch`
      // dưới hiểu NHẦM thành trùng TÊN kênh (CH_001).
      const candidates = Array.from(new Set(dto.initialMemberIds)).filter((id) => id !== actorId);
      if (candidates.length > 0) {
        const activeMemberships = await prisma.workspaceMembership.findMany({
          where: { workspaceId, userId: { in: candidates }, status: "ACTIVE" },
          select: { userId: true },
        });
        const activeIds = new Set(activeMemberships.map((m) => m.userId));
        const invalidUserIds = candidates.filter((id) => !activeIds.has(id));
        if (invalidUserIds.length > 0) {
          throw new AppError(ErrorMessages[ErrorCode.CH_011], 400, ErrorCode.CH_011, { invalidUserIds });
        }
        initialMemberIds = candidates;
      }
    }

    let channel: Channel;
    try {
      channel = await withTransaction(async (tx) => {
        const created = await tx.channel.create({
          data: {
            workspaceId,
            name: dto.name,
            normalizedName,
            description: dto.description,
            type: dto.type,
            visibility: dto.visibility,
            postingPolicy: dto.postingPolicy,
            createdBy: actorId,
            memberCount: dto.visibility === "PRIVATE" ? 1 + initialMemberIds.length : 1,
          },
        });
        await tx.counter.create({ data: { key: `ch:${created.id}`, seq: 0 } });

        if (dto.visibility === "PUBLIC") {
          await tx.channelMembership.create({ data: { channelId: created.id, workspaceId, userId: actorId } });
        } else {
          await tx.channelGrant.create({
            data: { channelId: created.id, workspaceId, userId: actorId, subjectKey: actorId, level: "MANAGER", grantedBy: actorId },
          });
          await tx.channelMembership.create({ data: { channelId: created.id, workspaceId, userId: actorId } });
          for (const userId of initialMemberIds) {
            await tx.channelGrant.create({
              data: { channelId: created.id, workspaceId, userId, subjectKey: userId, level: "MEMBER", grantedBy: actorId },
            });
            await tx.channelMembership.create({ data: { channelId: created.id, workspaceId, userId } });
          }
        }

        await outbox.add(tx, {
          type: "channel.created",
          aggregateType: "Channel",
          aggregateId: created.id,
          queue: "notifications",
          jobName: "channel.events",
          dedupeKey: `channel.created:${created.id}`,
          payload: {
            event: "created",
            channelId: created.id,
            workspaceId,
            visibility: dto.visibility,
            grantedUserIds: initialMemberIds,
            actorId,
          },
        });

        if (initialMemberIds.length > 0) {
          await notify(tx, {
            type: "channel.private-added",
            actorId,
            scope: { type: "CHANNEL", id: created.id },
            workspaceId,
            source: { type: "Channel", id: created.id },
            refs: { workspaceId, channelId: created.id, action: "added" },
            recipients: initialMemberIds.map((userId) => ({ userId })),
            dedupeKey: `channel.private-added:${created.id}:create`,
          });
        }

        return created as unknown as Channel;
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const archived = await this.channelRepo.findByWorkspaceAndNormalizedName(workspaceId, normalizedName, "ARCHIVED");
        throw new AppError(
          ErrorMessages[ErrorCode.CH_001],
          409,
          ErrorCode.CH_001,
          archived ? { archivedChannelId: archived.id } : undefined
        );
      }
      throw err;
    }

    await auditService.record({
      actorId,
      action: "channel.create",
      targetType: "Channel",
      targetId: channel.id,
      workspaceId,
    });

    const isPrivate = dto.visibility === "PRIVATE";
    const access: ResolvedAccess = {
      visible: true,
      role: isPrivate ? "MANAGER" : "ADMIN",
      actions: computeChannelActions({ isPrivate, manage: true, writable: true, postingPolicy: dto.postingPolicy }),
    };
    const membership = await this.membershipRepo.find(channel.id, actorId);
    const grant = isPrivate ? await this.grantRepo.findDirect(channel.id, actorId) : null;
    return toChannelDetail(channel, access, membership, grant);
  }

  async list(userId: string, workspaceId: string, params: ListChannelsParams, opts: { guest?: boolean } = {}): Promise<ListChannelsResult> {
    const allMemberships = await this.membershipRepo.listByUser(workspaceId, userId);
    // p3-04 §5.6 — khách chỉ thấy kênh CHỈ ĐỊNH (grant DIRECT): bỏ membership sót của kênh không còn grant, không có `discoverable`.
    const designated = opts.guest ? new Set(await this.grantRepo.listChannelIdsForUser(workspaceId, userId)) : null;
    const memberships = designated ? allMemberships.filter((m) => designated.has(m.channelId)) : allMemberships;
    const joinedIds = new Set(memberships.map((m) => m.channelId));
    const membershipByChannel = new Map<string, ChannelMembership>(memberships.map((m) => [m.channelId, m]));

    let joined: ChannelListItem[] = [];
    if (params.include === "joined" || params.include === "all") {
      const channels = await this.channelRepo.listByIds([...joinedIds]);
      joined = channels
        .filter((c) => c.status === params.status && (!params.type || c.type === params.type))
        .map((c) => toChannelListItem(c, membershipByChannel.get(c.id) ?? null))
        .sort(sortChannelListItems);
    }

    let discoverable: ChannelListItem[] = [];
    if (!opts.guest && params.status === "ACTIVE" && (params.include === "discover" || params.include === "all")) {
      const publicActive = await this.channelRepo.listByWorkspace(workspaceId, "ACTIVE", params.type);
      discoverable = publicActive
        .filter((c) => c.visibility === "PUBLIC" && !joinedIds.has(c.id))
        .map((c) => toChannelListItem(c, null))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const [joinedWithVoice, discoverableWithVoice] = await Promise.all([this.withVoiceActivity(joined), this.withVoiceActivity(discoverable)]);
    return { joined: joinedWithVoice, discoverable: discoverableWithVoice };
  }

  /**
   * (p2-03) Gắn số người đang trong phòng thoại vào kênh VOICE — qua cổng `shared/ports` (không import `modules/calls`), MỘT lượt đọc
   * cho mọi kênh của danh sách. Best-effort: cổng chưa đăng ký hoặc lỗi → giữ nguyên danh sách (thiếu badge còn hơn lỗi cả danh sách).
   */
  private async withVoiceActivity(items: ChannelListItem[]): Promise<ChannelListItem[]> {
    const reader = getChannelVoiceActivityReader();
    const ids = items.filter((c) => c.type === "VOICE" && c.status === "ACTIVE").map((c) => c.id);
    if (!reader || ids.length === 0) return items;
    try {
      const activity = await reader.activityOf(ids);
      return items.map((c) => {
        const voice = activity.get(c.id);
        return voice ? { ...c, voice } : c;
      });
    } catch {
      return items;
    }
  }

  async searchNames(userId: string, workspaceId: string, q: string, opts: { guest?: boolean } = {}): Promise<ChannelListItem[]> {
    const needle = normalizeSearch(q);
    const covering = await this.coveringRolesOf(workspaceId, userId);
    const [publicActive, myGrantChannelIds] = await Promise.all([
      this.channelRepo.listByWorkspace(workspaceId, "ACTIVE"),
      this.grantRepo.listChannelIdsForUser(workspaceId, userId, covering),
    ]);
    const grantSet = new Set(myGrantChannelIds);
    // Khách: chỉ kênh có grant DIRECT (kể cả kênh public); thành viên: public ∪ grant.
    const visible = publicActive.filter((c) => (opts.guest ? grantSet.has(c.id) : c.visibility === "PUBLIC" || grantSet.has(c.id)));
    const matched = visible.filter((c) => c.normalizedName.includes(needle));
    matched.sort((a, b) => a.normalizedName.indexOf(needle) - b.normalizedName.indexOf(needle) || a.name.localeCompare(b.name));

    const top = matched.slice(0, 20);
    const memberships = await this.membershipRepo.listByUser(workspaceId, userId);
    const membershipByChannel = new Map(memberships.map((m) => [m.channelId, m]));
    return top.map((c) => toChannelListItem(c, membershipByChannel.get(c.id) ?? null));
  }

  async get(channelId: string, userId: string, access: ResolvedAccess): Promise<ChannelDetail> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    const [membership, grant] = await Promise.all([
      this.membershipRepo.find(channelId, userId),
      this.myGrantOf(channel, userId),
    ]);
    return toChannelDetail(channel, access, membership, grant);
  }

  async patch(userId: string, channelId: string, dto: UpdateChannelDto, access: ResolvedAccess): Promise<ChannelDetail> {
    const normalizedName = dto.name !== undefined ? normalizeSearch(dto.name) : undefined;

    let channel: Channel;
    try {
      channel = await withTransaction(async (tx) => {
        const data: Record<string, unknown> = {};
        // p2-03 — cấu hình phòng thoại (chỉ kênh VOICE): hợp nhất với giá trị hiện có TRONG cùng transaction/CAS version.
        let videoDisabled = false;
        if (dto.voiceSettings !== undefined) {
          const before = await tx.channel.findUnique({ where: { id: channelId } });
          if (!before) throw new NotFoundError();
          const change = planVoiceSettingsChange(before as unknown as Channel, dto.voiceSettings);
          if (change) {
            data.voiceSettings = { set: change.next };
            videoDisabled = change.videoDisabled;
          }
        }
        if (dto.name !== undefined) {
          data.name = dto.name;
          data.normalizedName = normalizedName;
        }
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.postingPolicy !== undefined) data.postingPolicy = dto.postingPolicy;

        const result = await tx.channel.updateMany({
          where: { id: channelId, version: dto.expectedVersion, status: "ACTIVE" },
          data: { ...data, version: { increment: 1 } },
        });
        if (result.count === 0) {
          const current = await tx.channel.findUnique({ where: { id: channelId } });
          if (!current) throw new NotFoundError();
          if (current.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.CH_004], 403, ErrorCode.CH_004);
          throw new VersionConflictError(current.version);
        }

        const updated = await tx.channel.findUniqueOrThrow({ where: { id: channelId } });

        await outbox.add(tx, {
          type: "channel.updated",
          aggregateType: "Channel",
          aggregateId: channelId,
          queue: "notifications",
          jobName: "channel.events",
          dedupeKey: `channel.updated:${channelId}:v${updated.version}`,
          payload: { event: "updated", channelId, workspaceId: updated.workspaceId },
        });
        // `allowVideo` true → false: dòng outbox RIÊNG cho `calls` (thu quyền camera của phòng đang chạy — p2-03 be.md §5.9).
        if (videoDisabled) await outbox.add(tx, videoDisabledOutbox(channelId, updated.workspaceId, updated.version));

        return updated as unknown as Channel;
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new AppError(ErrorMessages[ErrorCode.CH_001], 409, ErrorCode.CH_001);
      }
      throw err;
    }

    await invalidateChannelMetaCache(channelId);

    const [membership, grant] = await Promise.all([
      this.membershipRepo.find(channelId, userId),
      this.myGrantOf(channel, userId),
    ]);
    return toChannelDetail(channel, access, membership, grant);
  }

  async join(userId: string, channelId: string): Promise<ChannelListItem> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    if (channel.visibility === "PRIVATE") {
      throw new AppError(ErrorMessages[ErrorCode.CH_008], 400, ErrorCode.CH_008);
    }

    const existing = await this.membershipRepo.find(channelId, userId);
    if (!existing) {
      await withTransaction(async (tx) => {
        await tx.channelMembership.create({ data: { channelId, workspaceId: channel.workspaceId, userId } });
        await tx.channel.update({ where: { id: channelId }, data: { memberCount: { increment: 1 } } });
      });

      joinRooms([userId], [ROOM.channel(channelId)]);
    }

    const membership = await this.membershipRepo.find(channelId, userId);
    return toChannelListItem(channel, membership);
  }

  async leave(userId: string, channelId: string): Promise<void> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    if (channel.isDefault) {
      throw new AppError(ErrorMessages[ErrorCode.CH_009], 400, ErrorCode.CH_009);
    }

    if (channel.visibility === "PRIVATE") {
      const grant = await this.grantRepo.findDirect(channelId, userId);
      if (grant?.level === "MANAGER") {
        const managerCount = await this.grantRepo.countManagers(channelId);
        if (managerCount <= 1 && channel.status === "ACTIVE") {
          throw new AppError(ErrorMessages[ErrorCode.CH_003], 409, ErrorCode.CH_003);
        }
      }
      // Còn được phủ bởi role grant → rời thẳng tay chỉ bỏ grant DIRECT, quyền đọc + membership giữ nguyên (README §2 PR-05).
      const stillViaRole = (await this.roleGrantsOf(channel, userId)).length > 0;
      await withTransaction(async (tx) => {
        await tx.channelGrant.deleteMany({ where: { channelId, userId, source: "DIRECT" } });
        if (stillViaRole) return;
        await tx.channelMembership.deleteMany({ where: { channelId, userId } });
        await tx.channel.update({ where: { id: channelId }, data: { memberCount: { decrement: 1 } } });
      });
      if (stillViaRole) {
        await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
        await invalidateChannelMetaCache(channelId);
        return;
      }
    } else {
      await withTransaction(async (tx) => {
        const deleted = await tx.channelMembership.deleteMany({ where: { channelId, userId } });
        if (deleted.count > 0) {
          await tx.channel.update({ where: { id: channelId }, data: { memberCount: { decrement: 1 } } });
        }
      });
    }

    leaveRooms([userId], [ROOM.channel(channelId)]);
  }

  async me(userId: string, channelId: string, dto: ChannelMeDto): Promise<{ notifyMode: ChannelMembership["notifyMode"]; pinned: boolean; position: number | null }> {
    const updated = await prisma.channelMembership.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: {
        channelId,
        userId,
        workspaceId: (await this.requireChannel(channelId)).workspaceId,
        ...(dto.notifyMode !== undefined && { notifyMode: dto.notifyMode }),
        ...(dto.pinned !== undefined && { pinned: dto.pinned }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
      update: {
        ...(dto.notifyMode !== undefined && { notifyMode: dto.notifyMode }),
        ...(dto.pinned !== undefined && { pinned: dto.pinned }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    });
    // p1-07: kênh MUTED không tính vào `unreadChannels` của `GET /me/unread/summary` → xoá cache + báo máy khác.
    if (dto.notifyMode !== undefined) await notifyUnreadSummaryChanged(userId, "MUTE");
    return { notifyMode: updated.notifyMode, pinned: updated.pinned, position: updated.position };
  }

  /** Grant theo vai trò đang phủ tới user (rỗng khi không có cổng vai trò / user không được phủ). */
  private async roleGrantsOf(channel: Channel, userId: string): Promise<ChannelGrant[]> {
    const covering = await this.coveringRolesOf(channel.workspaceId, userId);
    if (covering.length === 0) return [];
    const grants = await this.grantRepo.forUser(channel.id, userId, covering);
    return grants.filter((g) => g.source === "ROLE");
  }

  /** Grant hiển thị ở `myGrant`: DIRECT nếu có, không thì grant ROLE phủ tới (kênh riêng tư). */
  private async myGrantOf(channel: Channel, userId: string): Promise<ChannelGrant | null> {
    if (channel.visibility !== "PRIVATE") return null;
    const direct = await this.grantRepo.findDirect(channel.id, userId);
    if (direct) return direct;
    return (await this.roleGrantsOf(channel, userId))[0] ?? null;
  }

  private async coveringRolesOf(workspaceId: string, userId: string): Promise<readonly GrantRoleRef[]> {
    return this.roles ? this.roles.coveringRolesOf(workspaceId, userId) : [];
  }

  private async requireChannel(channelId: string): Promise<Channel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    return channel;
  }

  private async requireActiveWorkspace(workspaceId: string): Promise<{ id: string; status: string }> {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, status: true } });
    if (!workspace) throw new NotFoundError();
    if (workspace.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
    }
    return workspace;
  }
}

function sortChannelListItems(a: ChannelListItem, b: ChannelListItem): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  const posA = a.position ?? Number.POSITIVE_INFINITY;
  const posB = b.position ?? Number.POSITIVE_INFINITY;
  if (posA !== posB) return posA - posB;
  return a.name.localeCompare(b.name);
}
