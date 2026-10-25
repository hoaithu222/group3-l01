/** Mã lỗi BE (404) khi cờ phân hệ `project` đang tắt. */
export const PROJECT_FEATURE_OFF_CODE = 'CFG_005';

/** Màu cột biểu đồ — chỉ token scale `-5` (chart-conventions §1.2). */
export const PROJECT_CHART_COLORS = { done: 'success-5' } as const;

/** Cửa sổ (ngày) của số đếm xuất PDF trong khối "Báo cáo đóng góp" — khớp `?days=30` của BE (mặc định của endpoint). */
export const CONTRIBUTION_STATS_DAYS = 30;

/** Đích của liên kết "Mở trang Jobs": sub-tab job lỗi của `system-config` (`?tab=jobs&sub=failed`). */
export const CONTRIBUTION_JOBS_HREF = '/system-config?tab=jobs&sub=failed';
