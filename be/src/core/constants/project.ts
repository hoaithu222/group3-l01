/**
 * Hằng số dùng chung của phân hệ Dự án (Phase 3: p3-02 Kanban, p3-03 chi tiết thẻ; p4-* mở rộng).
 * Nằm ở `core/constants` để DTO, service, test của nhiều module/gói dùng CÙNG một danh sách — không
 * agent nào tự định nghĩa lại (nguồn: docs/plans/phase-3-projects-resources/p3-02..p3-03 be.md).
 */

/**
 * Khoá token màu của nhãn (`Label.color`) — KHÔNG hex tự do (p3-02 be.md §2/§9). Client map khoá → token
 * màu của design system; thêm/bớt token = PR chung `be` + `app` + `admin`.
 */
export const LABEL_COLOR_TOKENS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type LabelColorToken = (typeof LABEL_COLOR_TOKENS)[number];

/** Loại cột — logic XP/review/đóng góp dựa `kind`, KHÔNG dựa tên cột (p3-02 README §2). */
export const COLUMN_KINDS = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export type ColumnKindValue = (typeof COLUMN_KINDS)[number];

/** `BoardColumn.id` = "c_" + 8 ký tự [A-Za-z0-9], ổn định khi đổi tên cột. */
export const BOARD_COLUMN_ID_REGEX = /^c_[A-Za-z0-9]{8}$/;

export interface BoardColumnTemplate {
  title: string;
  kind: ColumnKindValue;
  wipLimit?: number | null;
}

/** Mẫu cột mặc định khi tạo bảng (SystemConfig `pm.defaultColumns` ghi đè; `id` sinh lúc tạo). Đúng 1 cột DONE. */
export const DEFAULT_BOARD_COLUMNS: readonly BoardColumnTemplate[] = [
  { title: "To do", kind: "TODO" },
  { title: "In progress", kind: "IN_PROGRESS" },
  { title: "Review", kind: "REVIEW" },
  { title: "Done", kind: "DONE" },
];

/**
 * `TaskActivity.type` (String trong schema để p4 mở rộng không cần đổi schema). Phase 3 (p3-02 ghi
 * CREATED/MOVED/DELETED/RESTORED; p3-03 ghi phần còn lại). Bình luận KHÔNG ghi activity (đã có `TaskComment`).
 * Phase 4: p4-04 thêm DEPENDENCY_ADDED, DEPENDENCY_REMOVED, RESCHEDULED; p4-05 thêm REVIEW_REQUESTED, REVIEW_SUBMITTED,
 * REVIEW_WAIVED, REVIEW_REASSIGNED.
 */
export const TASK_ACTIVITY_TYPES = [
  "CREATED",
  "RENAMED",
  "DESCRIPTION",
  "MOVED",
  "ASSIGNED",
  "UNASSIGNED",
  "LABELS",
  "START_CHANGED",
  "DUE_CHANGED",
  "POINTS",
  "CHECKLIST_ADDED",
  "CHECKLIST_DONE",
  "CHECKLIST_UNDONE",
  "CHECKLIST_EDITED",
  "CHECKLIST_REMOVED",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_REMOVED",
  "COMMENT_DELETED_BY_ADMIN",
  "DELETED",
  "RESTORED",
  // p4-04
  "DEPENDENCY_ADDED",
  "DEPENDENCY_REMOVED",
  /** Thẻ bị dời lịch do thẻ trước lùi hạn (`after` có `sourceTaskId` + `rescheduleId`). */
  "RESCHEDULED",
  // p4-05 — KHÔNG lưu điểm/nhận xét trong activity (dữ liệu chấm chỉ ở `TaskReview`, lọc theo người xem).
  /** Mở lượt chấm (`after`: `{ roundId, round, reviewerIds, autoApproved?, shortage? }`). */
  "REVIEW_REQUESTED",
  /** Một người nộp chấm (`after`: `{ reviewId, roundId, status }`). */
  "REVIEW_SUBMITTED",
  /** OWNER/ADMIN miễn chấm (`after`: `{ roundId }` — lý do nằm ở audit). */
  "REVIEW_WAIVED",
  /** Giao lại người chấm (`before`: `{ userId }`, `after`: `{ userId, roundId, cause }`). */
  "REVIEW_REASSIGNED",
] as const;
export type TaskActivityType = (typeof TASK_ACTIVITY_TYPES)[number];

/** `TaskWatcher.state` (P1). */
export const TASK_WATCH_STATES = ["AUTO_ON", "EXPLICIT_ON", "EXPLICIT_OFF"] as const;
export type TaskWatchState = (typeof TASK_WATCH_STATES)[number];
