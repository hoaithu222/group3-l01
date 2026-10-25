import { createHash } from "crypto";
import type { ReviewerLoad } from "../../entities/task-review.interface";

/**
 * Chọn người chấm cân tải (p4-05 be.md §5.2 bước 4) — THUẦN, tất định, test được:
 *   1) người đã chấm ở vòng trước (khi mở vòng mới) trước;
 *   2) số lượt chấm đang chờ (PENDING) trong WORKSPACE tăng dần (không theo bảng — một người không bị giao dồn từ nhiều bảng);
 *   3) lần được giao gần nhất cũ hơn trước (chưa từng = trước nhất);
 *   4) băm `sha1(taskId + userId)` tăng dần (ổn định, không thiên vị theo thứ tự danh sách);
 *   5) `userId` (chỉ để phá hoà tuyệt đối khi băm trùng).
 * Loại người làm / GUEST / ngoài `reviewerPool` do NƠI GỌI làm trước khi truyền `candidates`.
 */

export interface PickInput {
  /** Ứng viên đã lọc hợp lệ (không gồm người làm thẻ). */
  candidates: readonly string[];
  /** Tải theo người; thiếu ⇒ tải 0 và chưa từng được giao. */
  loads: ReadonlyMap<string, ReviewerLoad>;
  previousReviewers?: ReadonlySet<string>;
  taskId: string;
}

export const tieBreakHash = (taskId: string, userId: string): string => createHash("sha1").update(`${taskId}${userId}`).digest("hex");

/** Toàn bộ ứng viên theo thứ tự ưu tiên giao (không trùng). */
export function rankReviewers(input: PickInput): string[] {
  const previous = input.previousReviewers ?? new Set<string>();
  const entries = [...new Set(input.candidates)].map((userId) => {
    const load = input.loads.get(userId);
    return {
      userId,
      prev: previous.has(userId) ? 0 : 1,
      pending: load?.pending ?? 0,
      last: load?.lastAssignedAt ? load.lastAssignedAt.getTime() : Number.NEGATIVE_INFINITY,
      hash: tieBreakHash(input.taskId, userId),
    };
  });
  entries.sort((a, b) => {
    if (a.prev !== b.prev) return a.prev - b.prev;
    if (a.pending !== b.pending) return a.pending - b.pending;
    if (a.last !== b.last) return a.last < b.last ? -1 : 1;
    if (a.hash !== b.hash) return a.hash < b.hash ? -1 : 1;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
  return entries.map((e) => e.userId);
}

/** `n` người đầu của `rankReviewers`. */
export const pickReviewers = (input: PickInput, n: number): string[] => rankReviewers(input).slice(0, Math.max(0, n));
