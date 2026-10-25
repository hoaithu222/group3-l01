import type { Prisma } from "@prisma/client";
import { outbox } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { permissionService } from "../../../core/permission";
import { joinRooms, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { isGrantRoleRef, rolesCovering } from "../../../core/constants/role-coverage";
import type {
  ChannelGrantChange,
  ChannelGrantPort,
  ChannelMemberGrantInput,
  ChannelMemberRevokeInput,
} from "../../../shared/ports/channel-grant.port";
import { invalidateChannelMetaCache } from "./channel-permission.resolver";
import { ChannelRoleAccessService } from "./channel-role-access.service";

type Tx = Prisma.TransactionClient;

function emptyChange(input: { workspaceId: string; userId: string }): ChannelGrantChange {
  return { workspaceId: input.workspaceId, userId: input.userId, granted: [], already: [], skipped: [], revoked: [] };
}

/**
 * Cài đặt `ChannelGrantPort` (p3-04) — cấp/thu hồi grant DIRECT `MEMBER` cho một người (khách) trên nhiều kênh, dùng bởi
 * `workspaces`/`members` qua cổng (không import chéo). Đi thẳng `tx.*` vì thao tác PHẢI atomic với transaction của caller
 * (giống `ChannelBootstrapService`). Xem quy trình gọi ở `shared/ports/channel-grant.port.ts`.
 */
export class ChannelGrantPortService implements ChannelGrantPort {
  constructor(private readonly roleAccess: ChannelRoleAccessService = new ChannelRoleAccessService()) {}

  async grantMemberInTx(tx: Tx, input: ChannelMemberGrantInput): Promise<ChannelGrantChange> {
    const result = emptyChange(input);
    const ids = [...new Set(input.channelIds)];
    if (ids.length === 0) return result;

    const channels = await tx.channel.findMany({
      where: { id: { in: ids }, workspaceId: input.workspaceId },
      select: { id: true, status: true },
    });
    const statusById = new Map(channels.map((c) => [c.id, c.status]));
    const usable: string[] = [];
    for (const channelId of ids) {
      const status = statusById.get(channelId);
      if (!status) result.skipped.push({ channelId, reason: "NOT_FOUND" });
      else if (status !== "ACTIVE") result.skipped.push({ channelId, reason: "ARCHIVED" });
      else usable.push(channelId);
    }

    const existing = await tx.channelGrant.findMany({
      where: { channelId: { in: usable }, userId: input.userId, source: "DIRECT" },
      select: { channelId: true },
    });
    const have = new Set(existing.map((g) => g.channelId));

    for (const channelId of usable) {
      if (have.has(channelId)) {
        result.already.push(channelId);
        continue;
      }
      await tx.channelGrant.create({
        data: {
          channelId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          subjectKey: input.userId,
          level: "MEMBER",
          grantedBy: input.actorId,
        },
      });
      await tx.channelMembership.upsert({
        where: { channelId_userId: { channelId, userId: input.userId } },
        create: { channelId, workspaceId: input.workspaceId, userId: input.userId },
        update: {},
      });
      await this.recount(tx, channelId);
      await outbox.add(tx, {
        type: "channel.grant-added",
        aggregateType: "Channel",
        aggregateId: channelId,
        queue: "notifications",
        jobName: "channel.events",
        dedupeKey: `channel.grant-added:${channelId}:${input.userId}:${Date.now()}`,
        payload: {
          event: "granted",
          channelId,
          workspaceId: input.workspaceId,
          userIds: [input.userId],
          level: "MEMBER",
          via: "DIRECT",
          actorId: input.actorId,
        },
      });
      result.granted.push(channelId);
    }
    return result;
  }

  async revokeMemberInTx(tx: Tx, input: ChannelMemberRevokeInput): Promise<ChannelGrantChange> {
    const result = emptyChange(input);
    const ids = [...new Set(input.channelIds)];
    if (ids.length === 0) return result;

    const [grants, roleGrants, membership] = await Promise.all([
      tx.channelGrant.findMany({
        where: { channelId: { in: ids }, workspaceId: input.workspaceId, userId: input.userId, source: "DIRECT" },
        select: { channelId: true },
      }),
      tx.channelGrant.findMany({
        where: { channelId: { in: ids }, workspaceId: input.workspaceId, source: "ROLE" },
        select: { channelId: true, roleRef: true },
      }),
      tx.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
        select: { role: true, status: true },
      }),
    ]);
    const covering = membership?.status === "ACTIVE" ? rolesCovering(membership.role) : [];
    const viaRole = new Set(
      roleGrants.filter((g) => isGrantRoleRef(g.roleRef) && covering.includes(g.roleRef)).map((g) => g.channelId)
    );

    for (const { channelId } of grants) {
      await tx.channelGrant.deleteMany({ where: { channelId, userId: input.userId, source: "DIRECT" } });
      if (viaRole.has(channelId)) continue; // vẫn đọc được qua vai trò — giữ membership, không thu hồi phạm vi
      await tx.channelMembership.deleteMany({ where: { channelId, userId: input.userId } });
      await this.recount(tx, channelId);
      result.revoked.push(channelId);
    }
    return result;
  }

  async revokeAllInTx(tx: Tx, input: { workspaceId: string; userId: string }): Promise<void> {
    await outbox.add(tx, {
      type: "channel.membership-revoked",
      aggregateType: "WorkspaceMembership",
      aggregateId: `${input.workspaceId}:${input.userId}`,
      queue: "notifications",
      jobName: "channel.membership-revoked",
      dedupeKey: `channel.membership-revoked:${input.workspaceId}:${input.userId}:${Date.now()}`,
      payload: { workspaceId: input.workspaceId, userId: input.userId },
    });
  }

  async syncRoleAccessInTx(tx: Tx, input: { workspaceId: string; userId: string }): Promise<void> {
    await this.roleAccess.reconcileUser(tx, input.workspaceId, input.userId);
  }

  async afterCommit(change: ChannelGrantChange): Promise<void> {
    for (const channelId of change.granted) {
      await permissionService.bumpVersion({ type: "CHANNEL", id: channelId });
      await invalidateChannelMetaCache(channelId);
    }
    this.safeRealtime(() => joinRooms([change.userId], change.granted.map((id) => ROOM.channel(id))));

    for (const channelId of change.revoked) {
      await permissionService.revokeScope({
        scope: { type: "CHANNEL", id: channelId },
        userIds: [change.userId],
        reason: "GRANT_REVOKED",
      });
      await invalidateChannelMetaCache(channelId);
      this.safeRealtime(() =>
        emitToUsers([change.userId], "channel:revoked", { channelId, workspaceId: change.workspaceId, via: "DIRECT" })
      );
    }
  }

  private async recount(tx: Tx, channelId: string): Promise<void> {
    const memberCount = await tx.channelMembership.count({ where: { channelId } });
    await tx.channel.update({ where: { id: channelId }, data: { memberCount } });
  }

  /** Emit best-effort — lỗi phát (chưa có đường nào tới Socket.IO: script/test; worker đi qua cầu nối Redis p0-03) chỉ log, dữ liệu đã đúng. */
  private safeRealtime(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logger.warn("[channel-grant-port] realtime bị bỏ qua", { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
