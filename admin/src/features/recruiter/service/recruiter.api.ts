/**
 * Đường dẫn vận hành p6-08 — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/recruiter/admin-recruiter.routes.ts`:
 * `recruiter:view` xem, `recruiter:approve` duyệt/từ chối/tạm ngưng/khôi phục, `recruiter:update` đổi gói/hạn mức/thông tin (lý do + audit).
 * Quyền kiểm theo VAI HỆ THỐNG (nhân sự công ty có `recruiter:*` theo dữ liệu KHÔNG vào được các route này). Không gắn cờ `career`.
 */
const seg = encodeURIComponent;

export const recruiterApi = {
  /** GET `?page&limit&q&status&tier` → `AdminCompanyItem[]` (+ `meta` phân trang). */
  companies: '/admin/companies',
  /** GET chi tiết; PATCH `{ reason, expectedVersion, tier?, offerQuotaOverride?, name?, website?, taxCode? }`. */
  company: (id: string) => `/admin/companies/${seg(id)}`,
  /** POST `{ reason }` — `RECR_009` khi trạng thái hiện tại không cho phép hành động. */
  action: (id: string, action: 'approve' | 'reject' | 'suspend' | 'reinstate') =>
    `/admin/companies/${seg(id)}/${action}`,
  /** GET `?from&to&tz` (≤ 366 ngày). */
  stats: '/admin/recruiter/stats',
} as const;
