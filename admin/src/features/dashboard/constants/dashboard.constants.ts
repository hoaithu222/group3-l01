/**
 * Màu series chart của dashboard — CHỈ token scale `-5` (`chart-conventions.md §1.2`).
 */
/** Giá trị KPI khi chưa có số liệu (đang tải lần đầu / lỗi) — KHÔNG được thay bằng 0: 0 là một con số thật. */
export const NO_DATA = '—';

/** Chu kỳ poll lại `GET /admin/overview` CHỈ khi chưa vào được phòng `admin:ops` (xem `useOverview`). */
export const OVERVIEW_FALLBACK_POLL_MS = 30_000;

/**
 * Chu kỳ làm mới `GET /admin/overview/insights` khi tab đang hiển thị (xem `useInsights`). Bằng `staleTime` và bằng thời gian BE cache (~60 s):
 * poll nhanh hơn chỉ trả lại đúng bản cũ.
 */
export const INSIGHTS_POLL_MS = 60_000;

/**
 * `secondary-5` (cyan) = slot ĐẦU của `CHART_SERIES_TOKENS` — series phân loại mặc định của cả app. Trước đây
 * dùng `success-5`: lục là màu TRẠNG THÁI ("ổn / hoàn thành"), đặt lên một chuỗi đếm thuần làm người đọc tưởng
 * biểu đồ đang báo "tốt".
 */
export const DASHBOARD_CHART_COLORS = {
  activeUsers: 'secondary-5',
} as const;
