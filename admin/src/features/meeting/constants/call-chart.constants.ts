/**
 * Màu series chart thống kê cuộc gọi — CHỈ token scale `-5` (`chart-conventions.md §1.2`). Series khai ở đây, không rải magic string trong file chart.
 */
export const CALL_CHART_COLORS = {
  calls: 'info-5',
  minutes: 'warning-5',
  setupRate: 'success-5',
  answerRate: 'purple-5',
  reasons: 'azure-5',
} as const;

/** Trên mức này số cột dày đặc → ẩn nhãn trên đỉnh cột, chỉ giữ tooltip (`chart-conventions.md §3.2.5`). */
export const CALL_CHART_MAX_LABELED_BARS = 24;

/** Chiều cao vùng vẽ mỗi biểu đồ — `useChartMetrics` chọn bậc mật độ theo chiều cao THỰC của vùng này. */
export const CALL_CHART_HEIGHT_CLASS = 'h-60';
