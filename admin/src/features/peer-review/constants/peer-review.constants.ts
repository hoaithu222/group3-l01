/** Mã lỗi BE (404) khi cờ phân hệ `project` đang tắt — khối tự ẩn, tab cha đã báo "Dự án đang tắt". */
export const PROJECT_FEATURE_OFF_CODE = 'CFG_005';

/** Cửa sổ (ngày) của số liệu chấm chéo — khớp `?days=30` (mặc định) của `GET /admin/workspaces/:id/review-stats`. */
export const REVIEW_STATS_DAYS = 30;

/** Cache 60 giây (admin.md p4-05 §3) — số liệu tổng hợp, không cần tươi từng giây. */
export const REVIEW_STATS_STALE_MS = 60_000;

/** Số lượt chờ quá ngần này giờ tính là "quá hạn" — khớp `overdue72h` của BE (mốc nhắc thứ hai). */
export const REVIEW_OVERDUE_HOURS = 72;

/** Tỉ lệ lượt tự duyệt (do thiếu người chấm) vượt mức này ⇒ `Callout` gợi ý "nhóm có thể quá nhỏ" (admin.md §2.2). */
export const AUTO_APPROVE_WARN_RATIO = 0.3;
