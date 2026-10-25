export type ActivityKind = "task" | "checklist" | "comment" | "review";

export interface SourceCount {
  userId: string;
  /** "YYYY-MM-DD" theo múi giờ truyền vào. */
  date: string;
  kind: ActivityKind;
  count: number;
}

export interface ActivityScope {
  workspaceId: string;
  boardId: string;
}

/**
 * Đếm hoạt động THEO NGÀY từ nguồn (chỉ đọc) cho heatmap — nguồn của đếm là dữ liệu gốc, không bao giờ `$inc` (idempotent, chống lệch):
 *  - `TaskActivity` (`actorId ≠ null` — hoạt động do hệ thống không tính; bỏ `COMMENT_DELETED_BY_ADMIN`; `CHECKLIST_*` → `checklist`, còn lại → `task`),
 *  - `TaskComment` chưa xoá,
 *  - lượt chấm đã nộp (`ContributionReviewFact`).
 * Khoảng `[from, to)`; ngày tính theo `timezone`. Phía Prisma dùng aggregation của MongoDB (`$dateToString` có múi giờ) nên không kéo dữ liệu thô về.
 */
export interface IActivitySourceRepository {
  countTaskActivity(scope: ActivityScope, from: Date, to: Date, timezone: string): Promise<SourceCount[]>;
  countComments(scope: ActivityScope, from: Date, to: Date, timezone: string): Promise<SourceCount[]>;
  countReviews(scope: ActivityScope, from: Date, to: Date, timezone: string): Promise<SourceCount[]>;
}
