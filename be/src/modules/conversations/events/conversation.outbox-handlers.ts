import { registerJob } from "../../../infrastructure/queue";
import { prisma } from "../../../infrastructure/database";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { logger } from "../../../infrastructure/logger";
import { avatarUrlOf } from "../../../shared/media";
import { listActiveMemberIds } from "../permission/conversation.scope-resolver";

interface ConversationEventPayload {
  event: "created" | "updated" | "member-added" | "member-removed";
  conversationId: string;
  memberIds?: string[];
  userIds?: string[];
  userId?: string;
  reason?: string;
}

async function emitConversationCreated(conversationId: string, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;

  if (conversation.kind === "DIRECT") {
    // be.md §6 — DIRECT: emit RIÊNG cho từng người (`peer` khác nhau theo viewer).
    for (const userId of memberIds) {
      const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
      if (!member) continue;
      const peerUser = member.peerUserId
        ? await prisma.user.findUnique({ where: { id: member.peerUserId }, select: { name: true, avatarAssetId: true } })
        : null;
      emitToUsers([userId], SocketEvent.CONVERSATION_CREATED, {
        id: conversation.id,
        kind: "DIRECT",
        status: conversation.status,
        workspaceId: conversation.workspaceId,
        title: null,
        avatarUrl: null,
        peer: member.peerUserId
          ? { userId: member.peerUserId, name: peerUser?.name ?? "", avatarUrl: avatarUrlOf(peerUser?.avatarAssetId), presence: "OFFLINE" }
          : null,
        memberCount: conversation.memberCount,
        activityAt: conversation.activityAt,
        isMeetingGroup: false,
      });
    }
    return;
  }

  // GROUP — payload chung + `myRole` riêng từng người (be.md §6).
  const members = await prisma.conversationMember.findMany({ where: { conversationId, userId: { in: memberIds } } });
  for (const member of members) {
    emitToUsers([member.userId], SocketEvent.CONVERSATION_CREATED, {
      id: conversation.id,
      kind: "GROUP",
      status: conversation.status,
      workspaceId: conversation.workspaceId,
      title: conversation.title,
      avatarUrl: avatarUrlOf(conversation.avatarAssetId),
      memberCount: conversation.memberCount,
      activityAt: conversation.activityAt,
      isMeetingGroup: conversation.meetingId !== null,
      myRole: member.role,
    });
  }
}

/** Đọc lại hội thoại SAU commit ⇒ `avatarUrl` là ảnh MỚI (PATCH đổi/gỡ ảnh → URL mới/`null`) để client vá cache ngay; DIRECT luôn `null`. */
async function emitConversationUpdated(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;
  const payload = {
    id: conversation.id,
    title: conversation.title,
    avatarUrl: conversation.kind === "DIRECT" ? null : avatarUrlOf(conversation.avatarAssetId),
    status: conversation.status,
    settings: conversation.settings,
    memberCount: conversation.memberCount,
    version: conversation.version,
  };
  emitToRoom(ROOM.conversation(conversationId), SocketEvent.CONVERSATION_UPDATED, payload);
  const memberIds = await listActiveMemberIds(conversationId);
  emitToUsers(memberIds, SocketEvent.CONVERSATION_UPDATED, payload);
}

/**
 * `conversation.events` (queue `notifications`) — 1 processor duy nhất cho
 * MỌI sự kiện `conversation.*` (mục 9 "critical facts", mirror
 * `channel-events.consumer.ts`/`message.outbox-handlers.ts`), discriminate
 * qua `payload.event`.
 */
registerJob("notifications", "conversation.events", async (job) => {
  const payload = job.data as ConversationEventPayload;

  switch (payload.event) {
    case "created": {
      const memberIds = payload.memberIds ?? [];
      await emitConversationCreated(payload.conversationId, memberIds);
      break;
    }
    case "member-added": {
      const userIds = payload.userIds ?? [];
      await emitConversationCreated(payload.conversationId, userIds);
      emitToRoom(ROOM.conversation(payload.conversationId), SocketEvent.CONVERSATION_MEMBER_UPDATED, {
        conversationId: payload.conversationId,
        addedUserIds: userIds,
      });
      await emitConversationUpdated(payload.conversationId);
      break;
    }
    case "member-removed": {
      emitToRoom(ROOM.conversation(payload.conversationId), SocketEvent.CONVERSATION_MEMBER_UPDATED, {
        conversationId: payload.conversationId,
        userId: payload.userId,
        status: "REMOVED",
        reason: payload.reason,
      });
      await emitConversationUpdated(payload.conversationId);
      break;
    }
    case "updated": {
      await emitConversationUpdated(payload.conversationId);
      break;
    }
    default:
      logger.warn("[conversation.events] event lạ, bỏ qua", { event: payload.event });
  }
});
