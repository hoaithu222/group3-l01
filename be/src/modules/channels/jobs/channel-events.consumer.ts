import { prisma } from "../../../infrastructure/database";
import { permissionService } from "../../../core/permission";
import { registerJob } from "../../../infrastructure/queue";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { logger } from "../../../infrastructure/logger";
import { toChannelListItem } from "../services/channel.presenter";
import { effectiveVoiceSettings } from "../services/channel-voice-settings";
import type { Channel } from "../entities/channel.interface";
import { isGrantRoleRef } from "../../../core/constants/role-coverage";
import { loadRoleCoveredMembers } from "../services/channel-role-audience";

interface ChannelEventPayload {
  event: "created" | "updated" | "status-changed" | "granted" | "revoked";
  channelId: string;
  workspaceId: string;
  visibility?: "PUBLIC" | "PRIVATE";
  grantedUserIds?: string[];
  actorId?: string;
  status?: "ACTIVE" | "ARCHIVED";
  archiveReason?: string | null;
  replacementDefaultChannelId?: string;
  userIds?: string[];
  userId?: string;
  level?: string;
  /** p3-04 — nguồn quyền của sự kiện `granted` (mặc định `DIRECT`). */
  via?: "DIRECT" | "ROLE";
}

type ChannelRecord = Awaited<ReturnType<typeof prisma.channel.findUnique>>;

/** `ch:{id}` (đang mở) + (public `ws:{id}` | private `user:{id}` từng grantee hiện tại) — be.md §6. */
async function emitToChannelAudience(channel: NonNullable<ChannelRecord>, event: string, payload: object): Promise<void> {
  emitToRoom(ROOM.channel(channel.id), event, payload);
  if (channel.visibility === "PUBLIC") {
    emitToRoom(ROOM.workspace(channel.workspaceId), event, payload);
    return;
  }
  const grants = await prisma.channelGrant.findMany({
    where: { channelId: channel.id },
    select: { userId: true, source: true, roleRef: true },
  });
  const roleRefs = grants.flatMap((g) => (g.source === "ROLE" && isGrantRoleRef(g.roleRef) ? [g.roleRef] : []));
  const viaRole = await loadRoleCoveredMembers(channel.workspaceId, roleRefs);
  const audience = new Set<string>(viaRole.map((m) => m.userId));
  for (const g of grants) if (g.userId) audience.add(g.userId);
  emitToUsers([...audience], event, payload);
}

/**
 * `channel.events` (queue `notifications`) — relay outbox → socket (be.md §6/§7),
 * tách khỏi ghi DB (đã xong đồng bộ trong transaction gọi mở, `channel.service.ts`/
 * `channel-lifecycle.service.ts`/`channel-grant.service.ts`) để retry an toàn
 * (emit lặp vô hại). `revoked` KHÔNG emit lại ở đây — `channel:revoked` đã
 * phát đồng bộ ngay trong `channel-grant.service.ts#revoke()` (be.md §10 PR-03
 * cần độ trễ ≤ 2s, không chờ outbox relay).
 */
registerJob("notifications", "channel.events", async (job) => {
  const payload = job.data as ChannelEventPayload;
  const channel = await prisma.channel.findUnique({ where: { id: payload.channelId } });
  if (!channel) {
    logger.warn("[channel.events] kênh không còn tồn tại, bỏ qua", { channelId: payload.channelId });
    return;
  }

  switch (payload.event) {
    case "created": {
      const item = toChannelListItem(channel, null);
      if (channel.visibility === "PUBLIC") {
        emitToRoom(ROOM.workspace(channel.workspaceId), "channel:created", { channel: item });
      } else {
        const grantees = Array.from(new Set([...(payload.grantedUserIds ?? []), ...(payload.actorId ? [payload.actorId] : [])]));
        emitToUsers(grantees, "channel:created", { channel: item });
      }
      break;
    }
    case "updated": {
      await emitToChannelAudience(channel, "channel:updated", {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        postingPolicy: channel.postingPolicy,
        version: channel.version,
        // p2-03: kênh VOICE kèm cấu hình phòng thoại HIỆU LỰC để client cập nhật preview/nút bật camera mà không phải tải lại.
        ...(channel.type === "VOICE" && { voiceSettings: effectiveVoiceSettings(channel as unknown as Channel) }),
      });
      break;
    }
    case "status-changed": {
      await emitToChannelAudience(channel, "channel:archived", {
        id: channel.id,
        status: channel.status,
        archiveReason: channel.archiveReason,
        ...(payload.replacementDefaultChannelId && { replacementDefaultChannelId: payload.replacementDefaultChannelId }),
      });
      // Kênh vừa lưu trữ: báo cho module gắn với kênh đóng phạm vi (p2-03 — `calls` kết thúc phòng thoại `ARCHIVED`). Không có người dùng cụ
      // thể bị thu hồi (`userIds` rỗng): chỉ bump version + chạy listener; idempotent nên job retry vô hại.
      if (channel.status === "ARCHIVED") {
        await permissionService.revokeScope({ scope: { type: "CHANNEL", id: channel.id }, userIds: [], reason: "ARCHIVED" });
      }
      break;
    }
    case "granted": {
      const userIds = payload.userIds ?? (payload.userId ? [payload.userId] : []);
      emitToUsers(userIds, "channel:granted", {
        channelId: channel.id,
        workspaceId: channel.workspaceId,
        level: payload.level,
        via: payload.via ?? "DIRECT",
      });
      break;
    }
    case "revoked":
      break;
  }
});
