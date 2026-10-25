import { Prisma } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { permissionService } from "../../../core/permission";
import { joinRooms, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { GrantRoleRef } from "../../../core/constants/role-coverage";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify } from "../../notifications/public";
import type { IChannelRepository } from "../repositories/channel.repository.interface";
import type { IChannelGrantRepository } from "../repositories/channel-grant.repository.interface";
import type { Channel, ChannelMemberAccess, EffectiveAccessSource } from "../entities/channel.interface";
import { invalidateChannelMetaCache } from "./channel-permission.resolver";
import { toRoleGrantRow, type GrantRow } from "./channel.presenter";
import type { IChannelRoleAudience } from "./channel-role-audience";
import { ChannelRoleAccessService, type UserRoleSyncResult } from "./channel-role-access.service";

const auditService = new AuditService();

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Cấp/gỡ quyền kênh RIÊNG TƯ theo VAI TRÒ (p3-04 be.md §5.2) + đồng bộ khi vai trò người dùng đổi. Chỉ MEMBER (đọc/ghi);
 * MANAGER phải đích danh (`ChannelGrantService.add`). Cho phép cùng lúc DIRECT và ROLE — quyền là HỢP các nguồn.
 */
export class ChannelRoleGrantService {
  constructor(
    private readonly channelRepo: IChannelRepository,
    private readonly grantRepo: IChannelGrantRepository,
    private readonly roleAudience: IChannelRoleAudience,
    private readonly access: ChannelRoleAccessService = new ChannelRoleAccessService()
  ) {}

  /** `POST /channels/:id/grants/roles` — idempotent (đã có → trả lại dòng hiện có, không tạo/thông báo lại). */
  async add(actorId: string, channelId: string, roleRef: GrantRoleRef): Promise<GrantRow> {
    const channel = await this.requirePrivateActiveChannel(channelId);

    let created: boolean;
    let gained: string[];
    try {
      ({ created, gained } = await withTransaction(async (tx) => {
        const result = await this.access.addRoleGrant(tx, channel, roleRef, actorId);
        if (!result.created) return result;

        const stamp = Date.now();
        await outbox.add(tx, {
          type: "channel.grant-added",
          aggregateType: "Channel",
          aggregateId: channelId,
          queue: "notifications",
          jobName: "channel.events",
          dedupeKey: `channel.grant-added:${channelId}:role:${roleRef}:${stamp}`,
          payload: {
            event: "granted",
            channelId,
            workspaceId: channel.workspaceId,
            userIds: result.gained,
            level: "MEMBER",
            via: "ROLE",
            actorId,
          },
        });
        const recipients = result.gained.filter((id) => id !== actorId);
        if (recipients.length > 0) {
          await notify(tx, {
            type: "channel.private-added",
            actorId,
            scope: { type: "CHANNEL", id: channelId },
            workspaceId: channel.workspaceId,
            source: { type: "Channel", id: channelId },
            refs: { workspaceId: channel.workspaceId, channelId, action: "added", via: "ROLE" },
            recipients: recipients.map((userId) => ({ userId })),
            dedupeKey: `channel.private-added:${channelId}:role:${roleRef}:${stamp}`,
          });
        }
        return result;
      }));
    } catch (err) {
      // Hai yêu cầu đồng thời: bên thua đụng unique `[channelId, subjectKey, source]` → coi như idempotent (bắt NGOÀI transaction).
      if (!isUniqueConstraintError(err)) throw err;
      return this.requireRoleGrantRow(channelId, roleRef);
    }

    if (created) {
      await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
      await invalidateChannelMetaCache(channelId);
      this.safeRealtime(() => joinRooms(gained, [ROOM.channel(channelId)]));
      await auditService.record({
        actorId,
        action: "channel.grant-role",
        targetType: "Channel",
        targetId: channelId,
        workspaceId: channel.workspaceId,
        metadata: { roleRef, gained: gained.length },
      });
    }
    return this.requireRoleGrantRow(channelId, roleRef);
  }

  /** `DELETE /channels/:id/grants/roles/:roleRef` — idempotent. Người mất quyền (không còn DIRECT/role khác phủ tới) bị `revokeScope`. */
  async remove(actorId: string, channelId: string, roleRef: GrantRoleRef): Promise<void> {
    const channel = await this.requirePrivateChannel(channelId);

    const { removed, lost } = await withTransaction(async (tx) => {
      const result = await this.access.removeRoleGrant(tx, channel, roleRef);
      if (result.removed) {
        await outbox.add(tx, {
          type: "channel.grant-revoked",
          aggregateType: "Channel",
          aggregateId: channelId,
          queue: "notifications",
          jobName: "channel.events",
          dedupeKey: `channel.grant-revoked:${channelId}:role:${roleRef}:${Date.now()}`,
          payload: { event: "revoked", channelId, workspaceId: channel.workspaceId, userIds: result.lost, via: "ROLE", actorId },
        });
      }
      return result;
    });
    if (!removed) return;

    await this.revokeAccess(channel, lost, "GRANT_REVOKED");
    await invalidateChannelMetaCache(channelId);
    await auditService.record({
      actorId,
      action: "channel.grant-role-revoke",
      targetType: "Channel",
      targetId: channelId,
      workspaceId: channel.workspaceId,
      metadata: { roleRef, lost: lost.length },
    });
  }

  /** `GET /channels/:id/members/:userId/access` (PR-05) — quyền đọc THẬT của 1 người và các nguồn hiệu lực. */
  async effectiveAccess(channelId: string, targetUserId: string): Promise<ChannelMemberAccess> {
    const channel = await this.requirePrivateChannel(channelId);
    const covering = await this.roleAudience.coveringRolesOf(channel.workspaceId, targetUserId);
    const grants = await this.grantRepo.forUser(channelId, targetUserId, covering);

    const sources: EffectiveAccessSource[] = [];
    if (grants.some((g) => g.source === "DIRECT")) sources.push("DIRECT");
    for (const g of grants) {
      if (g.source === "ROLE" && (g.roleRef === "ADMIN" || g.roleRef === "MEMBER")) sources.push(`ROLE:${g.roleRef}`);
    }
    const read = sources.length > 0;
    const manage = grants.some((g) => g.source === "DIRECT" && g.level === "MANAGER");
    const workspace = read ? await prisma.workspace.findUnique({ where: { id: channel.workspaceId }, select: { status: true } }) : null;
    const write = read && channel.status === "ACTIVE" && workspace?.status === "ACTIVE";
    return { read, write, manage, effectiveSources: sources };
  }

  /**
   * Consumer `channel.role-access-sync` (đổi vai trò, RB-09): tính lại quyền của 1 người trên các kênh có role grant,
   * rồi phát realtime SAU commit — mất quyền → `revokeScope` (rời room + `permission:revoked`) + `channel:revoked`;
   * có quyền mới → vào room `ch:` + `channel:granted`. Idempotent (chạy lại không đổi gì).
   */
  async syncUserAfterRoleChange(workspaceId: string, userId: string): Promise<UserRoleSyncResult> {
    const result = await withTransaction((tx) => this.access.reconcileUser(tx, workspaceId, userId));

    for (const channelId of result.revoked) {
      await this.revokeAccess({ id: channelId, workspaceId }, [userId], "ROLE_CHANGED");
      await invalidateChannelMetaCache(channelId);
    }
    for (const channelId of result.granted) {
      this.safeRealtime(() => {
        joinRooms([userId], [ROOM.channel(channelId)]);
        emitToUsers([userId], "channel:granted", { channelId, workspaceId, level: "MEMBER", via: "ROLE" });
      });
      await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
      await invalidateChannelMetaCache(channelId);
    }
    return result;
  }

  private async revokeAccess(channel: { id: string; workspaceId: string }, userIds: string[], reason: "GRANT_REVOKED" | "ROLE_CHANGED"): Promise<void> {
    if (userIds.length === 0) {
      await permissionService.bumpVersion({ type: "CHANNEL", id: channel.id });
      return;
    }
    await permissionService.revokeScope({ scope: { type: "CHANNEL", id: channel.id }, userIds, reason });
    this.safeRealtime(() => emitToUsers(userIds, "channel:revoked", { channelId: channel.id, workspaceId: channel.workspaceId, via: "ROLE" }));
  }

  /** Emit best-effort — lỗi phát (chưa có đường nào tới Socket.IO: script/test; worker đi qua cầu nối Redis p0-03) chỉ log (dữ liệu đã đúng, client refetch được). */
  private safeRealtime(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logger.warn("[channel-role-grant] realtime bị bỏ qua", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async requireRoleGrantRow(channelId: string, roleRef: GrantRoleRef): Promise<GrantRow> {
    const grant = (await this.grantRepo.listRoleGrants(channelId)).find((g) => g.roleRef === roleRef);
    if (!grant) throw new NotFoundError();
    return toRoleGrantRow(grant);
  }

  private async requirePrivateChannel(channelId: string): Promise<Channel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel) throw new NotFoundError();
    // be.md §4: role grant chỉ cho PRIVATE — kênh công khai đã mở cho mọi thành viên (409).
    if (channel.visibility !== "PRIVATE") throw new AppError(ErrorMessages[ErrorCode.CH_008], 409, ErrorCode.CH_008);
    return channel;
  }

  private async requirePrivateActiveChannel(channelId: string): Promise<Channel> {
    const channel = await this.requirePrivateChannel(channelId);
    if (channel.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.CH_004], 403, ErrorCode.CH_004);
    return channel;
  }
}
