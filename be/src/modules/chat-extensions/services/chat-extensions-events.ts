import { POLL_MESSAGE_DELETED_JOB } from "../../../shared/ports/message-poll-reader.port";
import type { PollEntity, ScheduledMessageEntity, MessageReminderEntity } from "../entities/chat-extensions.types";
import type { IOutboxPort, TxHandle } from "../repositories/tx";

/**
 * Tên job của module (queue kèm theo). Mọi job HẸN GIỜ đi qua outbox với `availableAt` (bền qua restart Redis/worker; relay chỉ đẩy vào BullMQ khi tới hạn) và có `dedupeKey` gắn `version`
 * hoặc id thực thể — job cũ (đổi giờ/huỷ) tự vô hiệu nhờ CAS ở processor, KHÔNG cần huỷ job. `poll.message-deleted` do `messages` ghi (hằng chung ở `shared/ports`).
 */
export const CHAT_EXT_JOBS = {
  pollClose: { queue: "notifications", name: "poll.close" },
  pollEmit: { queue: "notifications", name: "poll.emit" },
  scheduledSend: { queue: "notifications", name: "scheduled-message.send" },
  reminderFire: { queue: "notifications", name: "message.reminder" },
  pollMessageDeleted: POLL_MESSAGE_DELETED_JOB,
  onUserAnonymized: { queue: "notifications", name: "chat-extensions.on-user-anonymized" },
  sweep: { queue: "cron", name: "chat-extensions.sweep" },
} as const;

export interface PollClosePayload {
  pollId: string;
}
export interface PollEmitPayload {
  pollId: string;
}
export interface PollMessageDeletedPayload {
  messageId: string;
}
export interface ScheduledSendPayload {
  scheduledMessageId: string;
  /** `ScheduledMessage.version` lúc hẹn — processor claim CAS theo đúng version này. */
  version: number;
}
export interface ReminderFirePayload {
  reminderId: string;
}
export interface UserAnonymizedPayload {
  userId: string;
}

/** Khoá jobId dùng cho cả outbox lẫn xếp lại (sweep/throttle): `dedupeKey` outbox CHÍNH LÀ jobId (relay đổi `:` → `_`). */
export const pollCloseKey = (pollId: string): string => `poll.close:poll:${pollId}`;
export const scheduledSendKey = (id: string, version: number): string => `scheduled-message.send:scheduled:${id}:v${version}`;
export const reminderFireKey = (id: string): string => `message.reminder:reminder:${id}`;

/** Hàng outbox hẹn giờ đóng khảo sát tại `closesAt` (chỉ khi có hạn). Processor kiểm lại `closesAt ≤ now + 1 s` và `OPEN` nên hàng thừa (đóng sớm) vô hại. */
export function writePollClose(outbox: IOutboxPort, tx: TxHandle, poll: Pick<PollEntity, "id" | "closesAt">): Promise<void> {
  if (!poll.closesAt) return Promise.resolve();
  return outbox.add(tx, {
    type: "poll.close.schedule",
    aggregateType: "Poll",
    aggregateId: poll.id,
    queue: CHAT_EXT_JOBS.pollClose.queue,
    jobName: CHAT_EXT_JOBS.pollClose.name,
    dedupeKey: pollCloseKey(poll.id),
    availableAt: poll.closesAt,
    payload: { pollId: poll.id } satisfies PollClosePayload,
  });
}

/** Hàng outbox hẹn giờ phát tin, khoá theo `version`: đổi giờ/nội dung/huỷ làm `version` đổi nên job cũ không còn khớp CAS (SCHED-03). */
export function writeScheduledSend(outbox: IOutboxPort, tx: TxHandle, scheduled: Pick<ScheduledMessageEntity, "id" | "sendAt" | "version">): Promise<void> {
  return outbox.add(tx, {
    type: "scheduled-message.send.schedule",
    aggregateType: "ScheduledMessage",
    aggregateId: scheduled.id,
    queue: CHAT_EXT_JOBS.scheduledSend.queue,
    jobName: CHAT_EXT_JOBS.scheduledSend.name,
    dedupeKey: scheduledSendKey(scheduled.id, scheduled.version),
    availableAt: scheduled.sendAt,
    payload: { scheduledMessageId: scheduled.id, version: scheduled.version } satisfies ScheduledSendPayload,
  });
}

/** Hàng outbox hẹn giờ nhắc lại tin tại `remindAt`. */
export function writeReminderFire(outbox: IOutboxPort, tx: TxHandle, reminder: Pick<MessageReminderEntity, "id" | "remindAt">): Promise<void> {
  return outbox.add(tx, {
    type: "message.reminder.schedule",
    aggregateType: "MessageReminder",
    aggregateId: reminder.id,
    queue: CHAT_EXT_JOBS.reminderFire.queue,
    jobName: CHAT_EXT_JOBS.reminderFire.name,
    dedupeKey: reminderFireKey(reminder.id),
    availableAt: reminder.remindAt,
    payload: { reminderId: reminder.id } satisfies ReminderFirePayload,
  });
}
