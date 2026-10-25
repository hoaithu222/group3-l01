/** Kiểu dùng riêng của trang Tổng quan phần "phân tích" (`GET /admin/overview/insights`) — hợp đồng dữ liệu ở `@/core/api/admin`. */

/** Chỉ số vẽ được trên biểu đồ xu hướng — mỗi giá trị ứng với MỘT chuỗi của `InsightsSeries` (trừ `calls`, KPI-only). */
export type TrendMetricKey = 'activeUsers' | 'signups' | 'messages' | 'callMinutes' | 'xp';

/** Mã thẻ KPI có số so với kỳ trước + sparkline. */
export type InsightKpiId = 'newUsers' | 'activeUsers' | 'messages' | 'calls' | 'xp';

export type DeltaDirection = 'up' | 'down' | 'flat';

/** Chỉ số nào "tốt khi tăng" (mặc định) hay "tốt khi giảm" — quyết định màu huy hiệu ▲▼. */
export type DeltaGoodWhen = 'up' | 'down';

/** Màu huy hiệu delta = màu `Badge` của kit. */
export type DeltaTone = 'success' | 'error' | 'neutral';

/**
 * Chênh lệch so với kỳ trước. `pct = null` khi KHÔNG tính được phần trăm (kỳ trước vắng hoặc bằng 0) — `direction` vẫn cho biết
 * "có tăng không" (0 → 5 là `up` nhưng không có `pct`).
 */
export interface MetricDelta {
  pct: number | null;
  direction: DeltaDirection;
}

export type HighlightLevel = 'info' | 'success' | 'warning' | 'error';

/** Một câu nhận xét "Điều đáng chú ý" sinh từ số liệu thật. */
export interface Highlight {
  /** Khoá ổn định (dùng làm `key` React) — mỗi luật một mã. */
  id: string;
  level: HighlightLevel;
  text: string;
  /** Có thì chip là liên kết (đường dẫn nội bộ của router). */
  href?: string;
}

/** Thứ `deriveHighlights` cần mà một hàm thuần không tự biết (quyền / đường dẫn) — nơi gọi dựng. */
export interface HighlightContext {
  /** Đường dẫn hàng đợi kiểm duyệt đã lọc OPEN — CHỈ truyền khi người dùng có quyền xem; vắng ⇒ chip không là liên kết. */
  moderationHref?: string;
}

/** Một điểm của biểu đồ xu hướng — hai kỳ ghép theo vị trí (ngày thứ i ↔ ngày thứ i). */
export interface TrendRow {
  /** Ngày của kỳ hiện tại, `YYYY-MM-DD`. */
  date: string;
  current: number;
  /** Kỳ trước cùng vị trí; `null` khi BE không có chuỗi kỳ trước. */
  previous: number | null;
  /** Ngày thật của điểm kỳ trước. */
  previousDate: string | null;
}
