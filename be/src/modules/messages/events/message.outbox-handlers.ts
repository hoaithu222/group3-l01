import { registerJob } from "../../../infrastructure/queue";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { logger } from "../../../infrastructure/logger";
import { getThreadHook } from "../../../core/permission";
import { createBurnoutSignalPort } from "../../burnout";
import { getMessageScope } from "../scope/message-scope.registry";
import { toBroadcastView } from "../services/message-projection";
import { loadPolls } from "../services/poll-view.loader";
import { PrismaMessageRepository } from "../repositories/message.repository.prisma";
import { wasActivityEmittedLive, wasEmittedLive } from "./message-live-emit";

const messageRepo = new PrismaMessageRepository();
// p7-03 be.md §5 "Collector" — cổng burnout radar: ghi MỘT tín hiệu hoạt động cho tác giả tin nhắn (chỉ ghi nếu người đó đã bật theo dõi — cổng tự kiểm, module này không cần biết).
const burnoutSignal = createBurnoutSignalPort();

interface MessageEventPayload {
  event: "created" | "updated" | "deleted" | "reaction-updated" | "pin-updated";
  messageId: string;
  // "updated"
  reason?: "EDIT" | "LINK_PREVIEW" | "SYSTEM_PAYLOAD";
  addedMentionIds?: string[];
  removedMentionIds?: string[];
  // "deleted"
  mode?: string;
  // "reaction-updated" / "pin-updated" — đã đủ dữ liệu trong payload, không cần đọc lại Message.
  scopeType?: "CHANNEL" | "CONVERSATION";
  scopeId?: string;
  emoji?: string;
  userId?: string;
  action?: "ADD" | "REMOVE";
  count?: number;
  pinned?: boolean;
  pinnedAt?: string;
  pinnedBy?: string;
}

/**
 * `message.events` (queue `notifications`) — relay outbox → socket emit (be.md
 * §6/§7), tách khỏi transaction ghi DB (đã commit trong `message.service.ts`/
 * `message-interaction.service.ts`). MỘT job xử lý CẢ 5 loại sự kiện của
 * module này (`message.created/updated/deleted/reaction.updated/pin.updated`)
 * qua `payload.event` — tránh 2 `registerJob("notifications", "message.events", ...)`
 * ghi đè lẫn nhau (mục 5 "critical facts", giống `channel.events`/
 * `membership.events`). `fanout.message`/`fanout.message-edit` (p1-07, be.md §7)
 * KHÔNG đi qua job này: `message.service.ts` ghi các dòng outbox RIÊNG cùng
 * transaction (một cặp queue/jobName chỉ giữ một processor) — xử lý ở
 * `modules/notifications/jobs/fanout-message.job.ts`.
 */
registerJob("notifications", "message.events", async (job) => {
  const payload = job.data as MessageEventPayload;

  switch (payload.event) {
    case "created":
    case "updated":
    case "deleted": {
      const message = await messageRepo.findById(payload.messageId);
      if (!message) {
        logger.warn("[message.events] tin nhắn không còn tồn tại, bỏ qua", { messageId: payload.messageId });
        return;
      }
      const scope = getMessageScope(message.scopeType);
      if (!scope) {
        logger.warn("[message.events] không có adapter cho scopeType, bỏ qua emit", { scopeType: message.scopeType });
        return;
      }
      const room = scope.contentRoom(message.scopeId);

      if (payload.event === "created") {
        // p7-04 — tin khảo sát mang thêm `poll` (bản dùng chung: không `myOptionIds`, khảo sát ẩn danh không lộ người bầu); worker phải đã đăng ký cổng đọc khảo sát (`worker-registries.ts`).
        const poll = message.kind === "POLL" ? (await loadPolls({ userId: null, canModerate: false }, [message]))?.get(message.id) : undefined;
        // API đã phát nhanh ngay sau commit (`emitMessageCreatedNow`) ⇒ bỏ lượt này cho khỏi trùng; phần còn lại của nhánh (activity, burnout, thread) vẫn chạy.
        if (!(await wasEmittedLive(message.id))) {
          emitToRoom(room, SocketEvent.MESSAGE_CREATED, poll ? { ...toBroadcastView(message), poll } : toBroadcastView(message));
        }
        // p7-03 — tin hệ thống có `authorId = null` (không tính là hoạt động của ai); cổng KHÔNG bao giờ ném lỗi (best-effort).
        if (message.authorId) await burnoutSignal.recordEvent(message.authorId, message.createdAt, message.id);
        // p1-06 be.md §7 — outbox `message.created` có `threadId` → emit
        // `thread:updated` (room kênh). `getThreadHook()` trả `null` khi
        // module `threads` chưa đăng ký (vd test cũ) — bỏ qua an toàn.
        if (message.threadId) {
          const threadHook = getThreadHook();
          if (threadHook) await threadHook.emitThreadUpdated(message.threadId);
        }
        if (message.threadKey === "root" && !(await wasActivityEmittedLive(message.id))) {
          await scope.emitActivity(message.scopeId, {
            messageId: message.id,
            seq: message.seq,
            createdAt: message.createdAt,
            kind: message.kind,
            authorId: message.authorId,
            mentions: message.mentions.map((m) => ({ type: m.type, targetId: m.targetId })),
          });
        }
      } else if (payload.event === "updated") {
        emitToRoom(room, SocketEvent.MESSAGE_UPDATED, {
          id: message.id,
          scopeType: message.scopeType,
          scopeId: message.scopeId,
          threadId: message.threadId,
          content: message.content,
          mentions: message.mentions,
          links: message.links,
          linkPreview: message.linkPreview,
          editedAt: message.editedAt,
          version: message.version,
          reason: payload.reason ?? "EDIT",
          // (p2-06) Tin hệ thống sửa tại chỗ (thẻ biên bản/thẻ họp): client cần payload mới để vẽ lại thẻ.
          ...(message.kind === "SYSTEM" ? { systemType: message.systemType, systemPayload: message.systemPayload } : {}),
        });
      } else {
        emitToRoom(room, SocketEvent.MESSAGE_DELETED, {
          id: message.id,
          scopeType: message.scopeType,
          scopeId: message.scopeId,
          threadId: message.threadId,
          seq: message.seq,
          deletedAt: message.deletedAt,
          mode: payload.mode ?? message.deleteMode,
        });
      }
      break;
    }

    case "reaction-updated": {
      if (!payload.scopeType || !payload.scopeId) return;
      const scope = getMessageScope(payload.scopeType);
      if (!scope) return;
      emitToRoom(scope.contentRoom(payload.scopeId), SocketEvent.REACTION_UPDATED, {
        messageId: payload.messageId,
        emoji: payload.emoji,
        count: payload.count,
        userId: payload.userId,
        action: payload.action,
      });
      break;
    }

    case "pin-updated": {
      if (!payload.scopeType || !payload.scopeId) return;
      const scope = getMessageScope(payload.scopeType);
      if (!scope) return;
      emitToRoom(scope.contentRoom(payload.scopeId), SocketEvent.PIN_UPDATED, {
        messageId: payload.messageId,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
        pinned: payload.pinned,
        ...(payload.pinnedAt && { pinnedAt: payload.pinnedAt }),
        ...(payload.pinnedBy && { pinnedBy: payload.pinnedBy }),
      });
      break;
    }
  }
});
