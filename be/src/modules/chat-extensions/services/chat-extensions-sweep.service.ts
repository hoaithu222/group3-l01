import type { IMessageReminderRepository } from "../repositories/message-reminder.repository.interface";
import type { IScheduledMessageRepository } from "../repositories/scheduled-message.repository.interface";
import { getChatExtLimits, type ChatExtLimits } from "./chat-extensions-limits";
import { CHAT_EXT_JOBS, reminderFireKey, scheduledSendKey, type ReminderFirePayload, type ScheduledSendPayload } from "./chat-extensions-events";
import type { PollService } from "./poll.service";

/** Xếp lại một job (best-effort, có trần thời gian) — bản cài đặt thật ở `chat-extensions-adapters.ts` (`QueueJobEnqueuer`). */
export interface IJobEnqueuer {
  enqueue(queue: string, name: string, payload: object, jobId: string): Promise<void>;
}

/** Cửa sổ gộp jobId khi xếp lại: cùng một bản ghi chỉ được xếp lại tối đa một lần mỗi 5 phút (chống cron dồn job). */
const REQUEUE_BUCKET_MS = 5 * 60 * 1000;
/** Lỡ giờ ≥ mức này mới coi là "job bị lỡ" (relay outbox + BullMQ thường trễ vài giây). */
const MISSED_GRACE_MS = 2 * 60 * 1000;
const BATCH = 200;

export interface SweepResult {
  scheduledRequeued: number;
  remindersRequeued: number;
  pollsClosed: number;
}

/**
 * Cron `chat-extensions.sweep` (mỗi 5 phút, be.md §7) — lưới an toàn khi mất/lỡ job hẹn giờ (Redis mất, outbox trễ, worker chết giữa `SENDING`):
 *  - tin hẹn giờ `PENDING` lỡ giờ > 2 phút hoặc kẹt `SENDING` quá `staleSendingSeconds` → xếp lại job phát CÙNG `version` (jobId thêm hậu tố cửa sổ 5 phút, vì job cũ đã hoàn tất/hỏng
 *    vẫn còn trong BullMQ nên `jobId` trùng sẽ bị bỏ qua); processor claim CAS nên xếp thừa vô hại;
 *  - nhắc lại `PENDING` lỡ giờ > 2 phút → xếp lại job nhắc;
 *  - khảo sát `OPEN` quá `closesAt` → đóng ngay.
 * Chạy lặp không đổi gì (mọi bước idempotent).
 */
export class ChatExtensionsSweepService {
  constructor(
    private readonly scheduled: Pick<IScheduledMessageRepository, "findStale">,
    private readonly reminders: Pick<IMessageReminderRepository, "findMissed">,
    private readonly polls: Pick<PollService, "sweepExpired">,
    private readonly jobs: IJobEnqueuer,
    private readonly limits: () => Promise<ChatExtLimits> = getChatExtLimits,
    private readonly now: () => Date = () => new Date()
  ) {}

  async run(): Promise<SweepResult> {
    const now = this.now();
    const bucket = Math.floor(now.getTime() / REQUEUE_BUCKET_MS);
    const limits = await this.limits();

    const stale = await this.scheduled.findStale(new Date(now.getTime() - MISSED_GRACE_MS), new Date(now.getTime() - limits.scheduled.staleSendingSeconds * 1000), BATCH);
    for (const m of stale) {
      const payload: ScheduledSendPayload = { scheduledMessageId: m.id, version: m.version };
      await this.jobs.enqueue(CHAT_EXT_JOBS.scheduledSend.queue, CHAT_EXT_JOBS.scheduledSend.name, payload, `${scheduledSendKey(m.id, m.version)}:r${bucket}`);
    }

    const missed = await this.reminders.findMissed(new Date(now.getTime() - MISSED_GRACE_MS), BATCH);
    for (const r of missed) {
      const payload: ReminderFirePayload = { reminderId: r.id };
      await this.jobs.enqueue(CHAT_EXT_JOBS.reminderFire.queue, CHAT_EXT_JOBS.reminderFire.name, payload, `${reminderFireKey(r.id)}:r${bucket}`);
    }

    const pollsClosed = await this.polls.sweepExpired(BATCH);
    return { scheduledRequeued: stale.length, remindersRequeued: missed.length, pollsClosed };
  }
}
