/**
 * Đường dẫn admin theo dõi sức khoẻ học tập — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/burnout/admin-burnout.routes.ts`: mọi route cần cờ `burnout`,
 * xem `gamification:view`, ghi bộ luật `gamification:update` (lý do 10–500 + audit `wellbeing.rules-update`).
 *
 * QUYỀN RIÊNG TƯ: chỉ có HAI đường dẫn và cả hai là chuỗi tĩnh — cố ý KHÔNG có hàm nhận `userId`. BE cũng không có route nào xem dữ liệu sức khoẻ của một người (test khoá cả hai phía).
 */
export const wellbeingApi = {
  /** GET `?weeks` (1–12, mặc định 12) — số liệu ẨN DANH: `{ insufficient, minimum }` hoặc `{ optInApprox, alertsPerWeek[], levelDistribution }`. */
  overview: '/admin/wellbeing/overview',
  /** GET — bộ luật hiện hành; PUT — lưu bản mới (CAS `expectedVersion`, `RES_003` khi lệch; `WELL_003`/`WELL_004` khi luật không hợp lệ). */
  rules: '/admin/wellbeing/rules',
} as const;
