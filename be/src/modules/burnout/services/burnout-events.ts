import type { OutboxEventInput } from "../../../infrastructure/queue";

/**
 * Tên job của module (queue kèm theo), p7-03 be.md §7. Khác kế hoạch ở HAI chỗ có chủ đích:
 *  - `wellbeing.evaluate` gộp `wellbeing.aggregate` + `wellbeing.assess` thành MỘT tick hằng giờ (mỗi người: tổng hợp rồi chấm ngay, không phụ thuộc thứ tự hai job) và chạy khi giờ địa phương của người dùng
 *    là 05:xx — SAU khi khung khuya kết thúc (kế hoạch ghi 01:00/01:30 nhưng chính quy ước "00:00–05:00 tính vào ngày hôm trước" đòi dữ liệu tới hết 05:00);
 *  - `wellbeing.optin-rebuild` KHÔNG có job riêng: tick hằng giờ đồng bộ lại tập "đã bật" trên Redis từ Mongo.
 */
export const BURNOUT_JOBS = {
  evaluate: { queue: "cron", name: "wellbeing.evaluate" },
  retention: { queue: "cron", name: "wellbeing.retention" },
  purge: { queue: "gamification", name: "wellbeing.purge" },
  onUserAnonymized: { queue: "gamification", name: "wellbeing.user-anonymized" },
} as const;

export interface PurgePayload {
  userId: string;
}
export interface UserAnonymizedPayload {
  userId: string;
}

/** Khoá jobId dùng cho outbox: gắn thời điểm tắt nên mỗi lần tắt (sau khi bật lại) là một job riêng, còn gửi lại cùng yêu cầu thì dedupe. */
export const purgeKey = (userId: string, optedOutAt: Date): string => `wellbeing.purge:user:${userId}:${String(optedOutAt.getTime())}`;

/** Dòng outbox "dọn dữ liệu sau khi tắt" ghi CÙNG transaction với việc tắt — job bền, chạy lại an toàn (xoá lặp không có tác dụng phụ). */
export function purgeOutboxRow(userId: string, optedOutAt: Date): OutboxEventInput {
  return {
    type: "wellbeing.opted-out",
    aggregateType: "WellbeingSetting",
    aggregateId: userId,
    queue: BURNOUT_JOBS.purge.queue,
    jobName: BURNOUT_JOBS.purge.name,
    dedupeKey: purgeKey(userId, optedOutAt),
    payload: { userId } satisfies PurgePayload,
  };
}
