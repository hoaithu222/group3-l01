import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getFanoutEditService, getFanoutService } from "../services/notification-wiring";
import type { FanoutEditInput, FanoutInput } from "../services/fanout.types";

/**
 * `fanout.message` (queue `notifications`, p1-07 be.md §5.4/§7) — MỘT job/tin, jobId `fanout.message:message:<id>`
 * (dedupeKey của dòng outbox riêng do `message.service.ts#send()` ghi cùng transaction với `message.created`;
 * relay đổi ":" → "_" khi dùng làm jobId BullMQ). Payload: `{ messageId, mentionUserIds, mentionAll, isFirstReply?,
 * parentAuthorId? }`. Retry 3 lần backoff mũ (mặc định queue); an toàn khi chạy lại (unique recipient + dedupe push).
 */
registerJob("notifications", "fanout.message", async (job) => {
  const data = job.data as FanoutInput;
  const stats = await getFanoutService().fanoutMessage({
    messageId: data.messageId,
    mentionUserIds: data.mentionUserIds,
    mentionAll: data.mentionAll,
    isFirstReply: data.isFirstReply,
    parentAuthorId: data.parentAuthorId,
  });
  logger.debug("[fanout.message] Hoàn tất", { messageId: data.messageId, ...stats });
});

/**
 * `fanout.message-edit` (jobId `fanout.message-edit:message:<id>:v<version>`) — `mentionDiff` của
 * `message.service.ts#edit()`: thêm người nhắc tên → mục hộp thư/push; gỡ → huỷ mục chưa đọc (MSG-33).
 */
registerJob("notifications", "fanout.message-edit", async (job) => {
  const data = job.data as FanoutEditInput;
  const stats = await getFanoutEditService().fanoutMessageEdit({
    messageId: data.messageId,
    addedUserIds: data.addedUserIds ?? [],
    removedUserIds: data.removedUserIds ?? [],
    allAdded: data.allAdded,
    allRemoved: data.allRemoved,
  });
  logger.debug("[fanout.message-edit] Hoàn tất", { messageId: data.messageId, ...stats });
});
