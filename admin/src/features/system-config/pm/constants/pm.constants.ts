/** Khoá registry của mẫu cột mặc định (`pm.defaultColumns`, p3-02). */
export const PM_CONFIG_KEY = 'pm';

/** Khoá registry chứa trần số cột (`limits.board.columnsMax`) — số cột tối đa của mẫu không vượt trần này. */
export const BOARD_LIMITS_KEY = 'limits.board';

/** Số cột của một bảng: 2–12, đúng 1 cột Hoàn thành — khớp schema `pm.defaultColumns` phía BE. */
export const COLUMNS_MIN = 2;
export const COLUMNS_MAX = 12;

/** Độ dài tên cột — khớp `LIMITS.board.columnTitleMax` phía BE. */
export const COLUMN_TITLE_MAX = 40;

/** Giới hạn WIP tuỳ chọn của một cột — khớp schema phía BE (giữ nguyên nếu mẫu đã lưu có). */
export const WIP_LIMIT_MIN = 1;
export const WIP_LIMIT_MAX = 500;

/** Cột mới thêm vào mẫu. */
export const NEW_COLUMN = { title: '', kind: 'IN_PROGRESS' } as const;

/** Khoá registry của mặc định công thức đóng góp cho bảng MỚI (`pm.contribution`, p4-06). */
export const CONTRIBUTION_DEFAULTS_KEY = 'pm.contribution';

/** Đường dẫn field múi giờ trong `value` của khoá `pm` (dùng chung với dời lịch/Gantt của p4-04). */
export const PM_TIMEZONE_PATH = 'timezone';

/** Ràng buộc công thức đóng góp — khớp schema `pm.contribution` phía BE (`be/src/core/constants/contribution.ts`). */
export const CONTRIBUTION_WEIGHT_TOTAL = 100;
export const CONTRIBUTION_GRACE_HOURS_MAX = 72;
export const CONTRIBUTION_UNESTIMATED_MAX = 13;
export const CONTRIBUTION_UNESTIMATED_STEP = 0.5;

/**
 * Câu "tác động" trong hộp thoại lý do khi lưu/khôi phục thẻ `pm` (chỉ còn field `timezone` sửa được ở form chung):
 * cảnh báo riêng vì đổi múi giờ dịch ranh giới ngày/tuần/tháng của báo cáo đóng góp (p4-06 admin.md §2.1).
 */
export const PM_TIMEZONE_SAVE_IMPACT =
  'Đổi múi giờ làm dịch ranh giới ngày, tuần và tháng: biểu đồ hoạt động (heatmap) và báo cáo đóng góp theo tuần/tháng của mọi bảng được tính lại theo múi giờ mới; lịch dời hạn và Gantt cũng tính "ngày" theo múi giờ này. Giá trị áp dụng cho mọi nhóm trong ≤ 60 giây.';

/** Mặc định D-09 — chỉ để dựng form khi BE chưa trả giá trị (bình thường lấy từ `item.effective`/`fields[].default`). */
export const CONTRIBUTION_FALLBACK = {
  weights: { points: 60, onTime: 20, peer: 20 },
  onTimeGraceHours: 0,
  unestimatedPoints: 1,
} as const;

/** Khoá registry của mặc định chấm chéo cho bảng MỚI (`pm.review`, p4-05): bật, số lượt duyệt, mốc nhắc người chấm. */
export const REVIEW_DEFAULTS_KEY = 'pm.review';

/** Số lượt duyệt mặc định 1–5 (`LIMITS.review.requiredMax` phía BE; trần hiện hành lấy từ `fields[].ceil` của khoá). */
export const REVIEW_REQUIRED_MIN = 1;
export const REVIEW_REQUIRED_MAX = 5;

/** Mốc nhắc người chấm: 1–3 mốc, mỗi mốc 1–168 giờ kể từ lúc được giao, tăng dần — khớp schema `pm.review` phía BE. */
export const REVIEW_REMINDERS_MAX = 3;
export const REVIEW_REMINDER_HOURS_MIN = 1;
export const REVIEW_REMINDER_HOURS_MAX = 168;

/** Mặc định của BE — chỉ để dựng form khi server chưa trả giá trị (bình thường lấy từ `item.effective`/`fields[].default`). */
export const REVIEW_FALLBACK = {
  enabledForNewBoards: false,
  requiredReviews: 2,
  reminderHours: [24, 72],
} as const;
