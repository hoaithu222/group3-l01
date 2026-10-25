import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerChatExtensionsModule } from "..";
import { getChatExtensionsContainer } from "../chat-extensions.container";
import {
  CHAT_EXT_JOBS,
  type PollClosePayload,
  type PollEmitPayload,
  type PollMessageDeletedPayload,
  type ReminderFirePayload,
  type ScheduledSendPayload,
  type UserAnonymizedPayload,
} from "../services/chat-extensions-events";

/**
 * Job của mở rộng chat (p7-04 be.md §7) — nạp bởi `infrastructure/queue/register-jobs.ts` ở CẢ API (PROCESS_ROLE=all) lẫn worker riêng. Worker không import `router.ts` nên đăng ký registry
 * (cổng đọc khảo sát cho `message:created`, loại thông báo) ngay đây. Mọi processor đều idempotent (CAS theo trạng thái/`version`):
 *
 *  - `notifications/poll.close`            — outbox `availableAt = closesAt`; đóng khảo sát (`EXPIRED`), phát `poll:updated`.
 *  - `notifications/poll.emit`             — cuối cửa sổ throttle 1 s: đọc số liệu MỚI NHẤT rồi phát `poll:updated`.
 *  - `notifications/poll.message-deleted`  — `messages` ghi khi tin khảo sát bị thu hồi/gỡ; đóng `MESSAGE_RECALLED`.
 *  - `notifications/scheduled-message.send`— outbox `availableAt = sendAt`, khoá theo `version`; claim CAS → kiểm quyền → gửi qua `IMessageSendPort` → `SENT`/`FAILED`.
 *  - `notifications/message.reminder`       — outbox `availableAt = remindAt`; claim CAS + `notify()` cùng transaction.
 *  - `notifications/chat-extensions.on-user-anonymized` — `UserAnonymizer` ghi dòng outbox riêng; huỷ tin hẹn/nhắc đang chờ, xoá phiếu bầu.
 *  - `cron/chat-extensions.sweep` (mỗi 5 phút, TĨNH) — xếp lại job bị lỡ, đóng khảo sát quá hạn.
 */
registerChatExtensionsModule();

registerJob(CHAT_EXT_JOBS.pollClose.queue, CHAT_EXT_JOBS.pollClose.name, async (job) => {
  const { pollId } = job.data as PollClosePayload;
  const outcome = await getChatExtensionsContainer().polls.closeExpired(pollId);
  logger.debug("[poll.close] Hoàn tất", { pollId, outcome });
});

registerJob(CHAT_EXT_JOBS.pollEmit.queue, CHAT_EXT_JOBS.pollEmit.name, async (job) => {
  const { pollId } = job.data as PollEmitPayload;
  await getChatExtensionsContainer().pollPublisher.emitLatest(pollId);
});

registerJob(CHAT_EXT_JOBS.pollMessageDeleted.queue, CHAT_EXT_JOBS.pollMessageDeleted.name, async (job) => {
  const { messageId } = job.data as PollMessageDeletedPayload;
  const outcome = await getChatExtensionsContainer().polls.closeForRecalledMessage(messageId);
  logger.debug("[poll.message-deleted] Hoàn tất", { messageId, outcome });
});

registerJob(CHAT_EXT_JOBS.scheduledSend.queue, CHAT_EXT_JOBS.scheduledSend.name, async (job) => {
  const { scheduledMessageId, version } = job.data as ScheduledSendPayload;
  // Lỗi hạ tầng được ném lại (BullMQ thử lại, tối đa 3 lần, backoff mũ); lỗi nghiệp vụ đã kết luận `FAILED` bên trong.
  const outcome = await getChatExtensionsContainer().dispatch.dispatch({ id: scheduledMessageId, version });
  logger.debug("[scheduled-message.send] Hoàn tất", { scheduledMessageId, version, outcome: outcome.kind });
});

registerJob(CHAT_EXT_JOBS.reminderFire.queue, CHAT_EXT_JOBS.reminderFire.name, async (job) => {
  const { reminderId } = job.data as ReminderFirePayload;
  const outcome = await getChatExtensionsContainer().reminders.fire(reminderId);
  logger.debug("[message.reminder] Hoàn tất", { reminderId, outcome });
});

registerJob(CHAT_EXT_JOBS.onUserAnonymized.queue, CHAT_EXT_JOBS.onUserAnonymized.name, async (job) => {
  const { userId } = job.data as UserAnonymizedPayload;
  if (!userId) {
    logger.warn("[chat-extensions.on-user-anonymized] payload thiếu userId, bỏ qua", { id: job.id });
    return;
  }
  const result = await getChatExtensionsContainer().userData.onUserAnonymized(userId);
  logger.info("[chat-extensions.on-user-anonymized] Đã dọn dữ liệu chat của tài khoản ẩn danh hoá", { userId, ...result });
});

registerJob(CHAT_EXT_JOBS.sweep.queue, CHAT_EXT_JOBS.sweep.name, async () => {
  const result = await getChatExtensionsContainer().sweep.run();
  if (result.scheduledRequeued > 0 || result.remindersRequeued > 0 || result.pollsClosed > 0) logger.info("[chat-extensions.sweep] Đã quét bù", result);
});

defineCron({
  schedulerId: CHAT_EXT_JOBS.sweep.name,
  queue: CHAT_EXT_JOBS.sweep.queue,
  jobName: CHAT_EXT_JOBS.sweep.name,
  pattern: "*/5 * * * *",
  opts: { attempts: 1 },
});
