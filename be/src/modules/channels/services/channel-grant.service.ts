import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import { joinRooms, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify } from "../../notifications/public";
import { getStates, type PresenceState } from "../../presence/presence.service";
import type { IChannelRepository } from "../repositories/channel.repository.interface";
import type { IChannelMembershipRepository } from "../repositories/channel-membership.repository.interface";
import type { IChannelGrantRepository } from "../repositories/channel-grant.repository.interface";
import type { Channel, GrantLevelValue, ListChannelMembersParams } from "../entities/channel.interface";
import type { AddGrantsDto } from "../dtos";
import { invalidateChannelMetaCache } from "./channel-permission.resolver";
import {
  toChannelMemberRowFromGrant,
  toChannelMemberRowFromMembership,
  toChannelMemberRowFromRole,
  toGrantRow,
  toRoleGrantRow,
  type ChannelMemberRow,
  type GrantRow,
} from "./channel.presenter";
import type { IChannelRoleAudience } from "./channel-role-audience";

const auditService = new AuditService();

export interface AddGrantsResult {
  added: string[];
  skipped: Array<{ userId: string; reason: "NOT_ACTIVE_MEMBER" | "ALREADY" }>;
}

/** `add/patch/revoke/list/members` (be.md §5.4). */
export class ChannelGrantService {
  constructor(
    private readonly channelRepo: IChannelRepository,
    private readonly membershipRepo: IChannelMembershipRepository,
    private readonly grantRepo: IChannelGrantRepository,
    /** p3-04 — người đọc được nhờ vai trò; không truyền → chỉ grant DIRECT (unit test Phase 1). */
    private readonly roleAudience?: IChannelRoleAudience
  ) {}

  /** Grant theo VAI TRÒ (nếu có) đứng trước, rồi grant DIRECT từng người. */
  async listGrants(channelId: string): Promise<GrantRow[]> {
    const channel = await this.requireChannel(channelId);
    if (channel.visibility !== "PRIVATE") {
      throw new AppError(ErrorMessages[ErrorCode.CH_008], 400, ErrorCode.CH_008);
    }
    const [rows, roleGrants] = await Promise.all([this.grantRepo.listByChannel(channelId), this.grantRepo.listRoleGrants(channelId)]);
    return [...roleGrants.map(toRoleGrantRow), ...rows.map(toGrantRow)];
  }

  async members(
    viewerId: string,
    channelId: string,
    params: ListChannelMembersParams
  ): Promise<{ data: ChannelMemberRow[]; total: number }> {
    const channel = await this.requireChannel(channelId);

    if (channel.visibility === "PRIVATE") {
      const direct = await this.grantRepo.listByChannel(channelId);
      const directIds = new Set(direct.map((row) => row.user.id));
      // Người đọc được nhờ vai trò mà CHƯA có grant DIRECT (DIRECT thắng khi trùng) — hiển thị "Được cấp qua vai trò".
      const viaRole = this.roleAudience ? (await this.roleAudience.listCoveredUsers(channelId)).filter((r) => !directIds.has(r.user.id)) : [];
      const all = [
        ...direct.map((row) => ({ user: row.user, build: (state: PresenceState) => toChannelMemberRowFromGrant(row, state) })),
        ...viaRole.map((row) => ({ user: row.user, build: (state: PresenceState) => toChannelMemberRowFromRole(row, state) })),
      ];
      const filtered = params.q ? filterByQuery(all, params.q) : all;
      filtered.sort((a, b) => a.user.name.localeCompare(b.user.name));
      const start = (params.page - 1) * params.limit;
      const page = filtered.slice(start, start + params.limit);
      const presenceMap = await getStates(viewerId, page.map((row) => row.user.id));
      return {
        data: page.map((row) => row.build(presenceMap[row.user.id]?.state ?? "OFFLINE")),
        total: filtered.length,
      };
    }

    const { data, total } = await this.membershipRepo.listByChannel(channelId, params);
    const presenceMap = await getStates(viewerId, data.map((row) => row.user.id));
    return {
      data: data.map((row) => toChannelMemberRowFromMembership(row.user, presenceMap[row.user.id]?.state ?? "OFFLINE")),
      total,
    };
  }

  async add(actorId: string, channelId: string, dto: AddGrantsDto): Promise<AddGrantsResult> {
    const channel = await this.requireChannel(channelId);
    if (channel.visibility !== "PRIVATE") {
      throw new AppError(ErrorMessages[ErrorCode.CH_008], 400, ErrorCode.CH_008);
    }
    if (channel.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.CH_004], 403, ErrorCode.CH_004);
    }

    const activeMemberships = await prisma.workspaceMembership.findMany({
      where: { workspaceId: channel.workspaceId, userId: { in: dto.userIds }, status: "ACTIVE" },
      select: { userId: true },
    });
    const activeSet = new Set(activeMemberships.map((m) => m.userId));

    const existingGrants = await Promise.all(dto.userIds.map((userId) => this.grantRepo.findDirect(channelId, userId)));
    const existingByUser = new Map(dto.userIds.map((userId, i) => [userId, existingGrants[i]]));

    const toGrant: string[] = [];
    const skipped: AddGrantsResult["skipped"] = [];
    for (const userId of dto.userIds) {
      if (!activeSet.has(userId)) {
        skipped.push({ userId, reason: "NOT_ACTIVE_MEMBER" });
        continue;
      }
      const existing = existingByUser.get(userId);
      if (existing && (existing.level === "MANAGER" || existing.level === dto.level)) {
        skipped.push({ userId, reason: "ALREADY" });
        continue;
      }
      toGrant.push(userId);
    }

    if (toGrant.length > 0) {
      const alreadyViaRole = new Set(this.roleAudience ? await this.roleAudience.listCoveredUserIds(channelId) : []);
      await withTransaction(async (tx) => {
        for (const userId of toGrant) {
          await tx.channelGrant.upsert({
            where: { channelId_subjectKey_source: { channelId, subjectKey: userId, source: "DIRECT" } },
            create: { channelId, workspaceId: channel.workspaceId, userId, subjectKey: userId, level: dto.level, grantedBy: actorId },
            update: { level: dto.level },
          });
          await tx.channelMembership.upsert({
            where: { channelId_userId: { channelId, userId } },
            create: { channelId, workspaceId: channel.workspaceId, userId },
            update: {},
          });
        }

        // `memberCount` = số người đọc được = số ChannelMembership (grant DIRECT lẫn role grant đều hiện thực hoá membership).
        const memberCount = await tx.channelMembership.count({ where: { channelId } });
        await tx.channel.update({ where: { id: channelId }, data: { memberCount } });

        await outbox.add(tx, {
          type: "channel.grant-added",
          aggregateType: "Channel",
          aggregateId: channelId,
          queue: "notifications",
          jobName: "channel.events",
          dedupeKey: `channel.grant-added:${channelId}:${Date.now()}`,
          payload: { event: "granted", channelId, workspaceId: channel.workspaceId, userIds: toGrant, level: dto.level, actorId },
        });

        // Người ĐÃ đọc được kênh nhờ vai trò không cần thông báo "được thêm vào kênh".
        const recipients = toGrant.filter((id) => id !== actorId && !alreadyViaRole.has(id));
        if (recipients.length > 0) {
          await notify(tx, {
            type: "channel.private-added",
            actorId,
            scope: { type: "CHANNEL", id: channelId },
            workspaceId: channel.workspaceId,
            source: { type: "Channel", id: channelId },
            refs: { workspaceId: channel.workspaceId, channelId, action: "added" },
            recipients: recipients.map((userId) => ({ userId })),
            dedupeKey: `channel.private-added:${channelId}:${Date.now()}`,
          });
        }
      });

      await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
      await invalidateChannelMetaCache(channelId);
      joinRooms(toGrant, [ROOM.channel(channelId)]);
      await auditService.record({
        actorId,
        action: "channel.grant",
        targetType: "Channel",
        targetId: channelId,
        workspaceId: channel.workspaceId,
        metadata: { userIds: toGrant, level: dto.level },
      });
    }

    return { added: toGrant, skipped };
  }

  async patchLevel(actorId: string, channelId: string, targetUserId: string, level: GrantLevelValue): Promise<GrantRow> {
    const channel = await this.requireChannel(channelId);
    if (channel.visibility !== "PRIVATE") {
      throw new AppError(ErrorMessages[ErrorCode.CH_008], 400, ErrorCode.CH_008);
    }
    const grant = await this.grantRepo.findDirect(channelId, targetUserId);
    if (!grant) throw new NotFoundError();

    if (grant.level === "MANAGER" && level === "MEMBER") {
      const managerCount = await this.grantRepo.countManagers(channelId);
      if (managerCount <= 1) {
        throw new AppError(ErrorMessages[ErrorCode.CH_003], 409, ErrorCode.CH_003);
      }
    }

    if (grant.level !== level) {
      await withTransaction(async (tx) => {
        await tx.channelGrant.update({
          where: { channelId_subjectKey_source: { channelId, subjectKey: targetUserId, source: "DIRECT" } },
          data: { level },
        });
        await outbox.add(tx, {
          type: "channel.grant-changed",
          aggregateType: "Channel",
          aggregateId: channelId,
          queue: "notifications",
          jobName: "channel.events",
          dedupeKey: `channel.grant-changed:${channelId}:${targetUserId}:${Date.now()}`,
          payload: { event: "granted", channelId, workspaceId: channel.workspaceId, userId: targetUserId, level, actorId },
        });
      });

      await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
      await invalidateChannelMetaCache(channelId);
      await auditService.record({
        actorId,
        action: "channel.grant-patch",
        targetType: "Channel",
        targetId: channelId,
        workspaceId: channel.workspaceId,
        metadata: { targetUserId, level },
      });
    }

    const rows = await this.grantRepo.listByChannel(channelId);
    const row = rows.find((r) => r.user.id === targetUserId);
    if (!row) throw new NotFoundError();
    return toGrantRow(row);
  }

  /** Idempotent (giống `invite.service.ts#revoke`) — gọi lại khi grant đã bị xoá không lỗi. */
  async revoke(actorId: string, channelId: string, targetUserId: string): Promise<void> {
    const channel = await this.requireChannel(channelId);
    if (channel.visibility !== "PRIVATE") return;

    const grant = await this.grantRepo.findDirect(channelId, targetUserId);
    if (!grant) return;

    if (grant.level === "MANAGER" && channel.status === "ACTIVE") {
      const managerCount = await this.grantRepo.countManagers(channelId);
      if (managerCount <= 1) {
        throw new AppError(ErrorMessages[ErrorCode.CH_003], 409, ErrorCode.CH_003);
      }
    }

    // PR-05: gỡ grant DIRECT khi người đó VẪN được phủ bởi role grant → vẫn đọc được, giữ membership (không thu hồi phạm vi).
    const stillViaRole = await this.stillViaRole(channel, targetUserId);

    await withTransaction(async (tx) => {
      await tx.channelGrant.deleteMany({ where: { channelId, userId: targetUserId, source: "DIRECT" } });
      if (!stillViaRole) {
        await tx.channelMembership.deleteMany({ where: { channelId, userId: targetUserId } });
      }
      const memberCount = await tx.channelMembership.count({ where: { channelId } });
      await tx.channel.update({ where: { id: channelId }, data: { memberCount } });

      await outbox.add(tx, {
        type: "channel.grant-revoked",
        aggregateType: "Channel",
        aggregateId: channelId,
        queue: "notifications",
        jobName: "channel.events",
        dedupeKey: `channel.grant-revoked:${channelId}:${targetUserId}:${Date.now()}`,
        payload: { event: "revoked", channelId, workspaceId: channel.workspaceId, userId: targetUserId, actorId },
      });
    });

    if (stillViaRole) {
      // Quyền đọc còn nguyên (qua vai trò) nhưng `manage` (nếu từng là MANAGER) đã mất → chỉ làm mới cache quyền.
      await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
      await invalidateChannelMetaCache(channelId);
      await auditService.record({
        actorId,
        action: "channel.grant-revoke",
        targetType: "Channel",
        targetId: channelId,
        workspaceId: channel.workspaceId,
        metadata: { targetUserId, stillViaRole: true },
      });
      return;
    }

    // `revokeScope` (be.md §5.4 "Sau commit đồng bộ") lo bump version + đá
    // socket khỏi `ch:{id}` + `permission:revoked` — KHÔNG tự hand-roll (mục 4
    // critical facts). `channel:revoked` cụ thể theo be.md §6 phát THÊM, vì
    // event chung `permission:revoked` không đủ cho client hiện đúng UI kênh.
    await permissionService.revokeScope({
      scope: { type: "CHANNEL", id: channelId },
      userIds: [targetUserId],
      reason: "GRANT_REVOKED",
    });
    await invalidateChannelMetaCache(channelId);
    emitToUsers([targetUserId], "channel:revoked", { channelId, workspaceId: channel.workspaceId });

    await auditService.record({
      actorId,
      action: "channel.grant-revoke",
      targetType: "Channel",
      targetId: channelId,
      workspaceId: channel.workspaceId,
      metadata: { targetUserId },
    });
  }

  /** User còn được phủ bởi ít nhất một role grant của kênh không (theo vai trò workspace HIỆN TẠI). */
  private async stillViaRole(channel: Channel, userId: string): Promise<boolean> {
    if (!this.roleAudience) return false;
    const covering = await this.roleAudience.coveringRolesOf(channel.workspaceId, userId);
    if (covering.length === 0) return false;
    return (await this.grantRepo.forUser(channel.id, userId, covering)).some((g) => g.source === "ROLE");
  }

  private async requireChannel(channelId: string): Promise<Channel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    return channel;
  }
}

function filterByQuery<T extends { user: { name: string } }>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((row) => row.user.name.toLowerCase().includes(needle));
}
