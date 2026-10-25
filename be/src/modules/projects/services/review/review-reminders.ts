import { cancelJob, scheduleAt, toSafeJobId } from "../../../../infrastructure/queue";
import { eventKeys } from "../../../../shared/events/domain-events";
import type { IReviewDefaults } from "./review-defaults";
import { REVIEW_REMINDER_JOB, REVIEW_REMINDER_QUEUE } from "./review-events";

/** Dữ liệu job nhắc chấm. `hours` = mốc (giờ kể từ lúc được giao) để processor biết đây là lần nhắc thứ mấy. */
export interface ReviewReminderJobData {
  reviewId: string;
  hours: number;
}

/**
 * Cổng hàng đợi hẹn giờ nhắc người chấm (p4-05 be.md §7) — bản BullMQ thật bên dưới, bản giả trong test. `jobId` tất định theo
 * (review, mốc) và LUÔN qua `toSafeJobId` (chuỗi gốc có ≥ 3 dấu `:`; tạo lẫn huỷ phải ra cùng một id). Huỷ chỉ là TỐI ƯU: processor
 * luôn kiểm lại review còn PENDING nên job lọt lưới cũng không gửi nhầm.
 */
export interface IReviewReminders {
  schedule(reviewId: string, hours: number, runAt: Date): Promise<void>;
  cancel(reviewIds: readonly string[], hours: readonly number[]): Promise<void>;
}

export const reminderJobId = (reviewId: string, hours: number): string => toSafeJobId(eventKeys.reviewReminder(reviewId, hours));

/** Trần chờ Redis khi huỷ nhắc: `queueConnection` KHÔNG tự reject khi Redis mất (lệnh xếp hàng chờ vô hạn) — không được treo phản hồi nộp chấm. */
const CANCEL_TIMEOUT_MS = 1000;

/**
 * Huỷ job nhắc theo review, BEST-EFFORT và CÓ TRẦN THỜI GIAN (sau commit, trên đường phản hồi request): lỗi/Redis chậm ⇒ bỏ qua, vì processor nhắc luôn
 * kiểm lại review còn PENDING. Mốc lấy từ cấu hình hiện tại (`pm.review.reminderHours`).
 */
export async function cancelRemindersBestEffort(
  reminders: IReviewReminders | undefined,
  defaults: IReviewDefaults,
  reviewIds: readonly string[]
): Promise<void> {
  if (!reminders || reviewIds.length === 0) return;
  try {
    const { reminderHours } = await defaults.load();
    await Promise.race([reminders.cancel(reviewIds, reminderHours), new Promise<void>((resolve) => setTimeout(resolve, CANCEL_TIMEOUT_MS).unref())]);
  } catch {
    // tối ưu, không bắt buộc
  }
}

export class BullReviewReminders implements IReviewReminders {
  schedule(reviewId: string, hours: number, runAt: Date): Promise<void> {
    const data: ReviewReminderJobData = { reviewId, hours };
    return scheduleAt(REVIEW_REMINDER_QUEUE, REVIEW_REMINDER_JOB, reminderJobId(reviewId, hours), data, runAt);
  }

  async cancel(reviewIds: readonly string[], hours: readonly number[]): Promise<void> {
    await Promise.all(reviewIds.flatMap((id) => hours.map((h) => cancelJob(REVIEW_REMINDER_QUEUE, reminderJobId(id, h)))));
  }
}
