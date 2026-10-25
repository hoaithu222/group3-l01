import { cancelJob, scheduleAt, toSafeJobId } from "../../../infrastructure/queue";
import type { DueReminderJobData, IReminderQueue } from "./task-due-reminder";

export const DUE_REMINDER_QUEUE = "notifications" as const;
export const DUE_REMINDER_JOB = "task.due-reminder" as const;

/** Hàng đợi BullMQ thật: `jobId` LUÔN qua `toSafeJobId` (tạo lẫn huỷ) để hai phía ra cùng một id. */
export class BullReminderQueue implements IReminderQueue {
  schedule(jobId: string, data: DueReminderJobData, runAt: Date): Promise<void> {
    return scheduleAt(DUE_REMINDER_QUEUE, DUE_REMINDER_JOB, toSafeJobId(jobId), data, runAt);
  }
  cancel(jobId: string): Promise<void> {
    return cancelJob(DUE_REMINDER_QUEUE, toSafeJobId(jobId));
  }
}
