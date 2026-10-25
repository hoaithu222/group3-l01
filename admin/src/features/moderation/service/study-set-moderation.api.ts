/**
 * Đường dẫn endpoint kiểm duyệt bộ học — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`).
 * Khớp `be/src/modules/study/study.admin.routes.ts` (p4-01 be.md §14); mọi route cần cờ `study`
 * (tắt → `404 CFG_005`).
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const studySetModerationApi = {
  /** GET (`moderation:view`) `?minReports&status&page&limit≤50` — tab `content`: bộ PUBLIC chưa xoá có ≥ `minReports` báo cáo mở, sắp giảm dần. */
  list: '/admin/study-sets',
  /** GET (`moderation:view`) → `{ userId, total, public, workspace, private, hidden }` — chỉ số liệu (tab "Học tập" của người dùng); 404 nếu không có người dùng. */
  userSummary: (userId: string) => `/admin/users/${seg(userId)}/study-summary`,
  /** GET (`moderation:view`) — metadata + `reportedCount` + `canViewContent`; PRIVATE/đã xoá → 404. */
  detail: (setId: string) => `/admin/study-sets/${seg(setId)}`,
  /** GET (`moderation:view`) `?page&limit≤50` — nội dung mục, CHỈ bộ PUBLIC (WORKSPACE → 403). */
  items: (setId: string) => `/admin/study-sets/${seg(setId)}/items`,
  /** POST (`moderation:update`) `{ reason }` — ẩn bộ PUBLIC, audit `study-set.hide`, đóng báo cáo mở. */
  hide: (setId: string) => `/admin/study-sets/${seg(setId)}/hide`,
  /** POST (`moderation:update`) `{ reason }` — khôi phục bộ PUBLIC đã ẩn, audit `study-set.restore`. */
  restore: (setId: string) => `/admin/study-sets/${seg(setId)}/restore`,
} as const;
