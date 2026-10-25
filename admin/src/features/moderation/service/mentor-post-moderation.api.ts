/**
 * Đường dẫn kiểm duyệt bài tìm cố vấn — khớp `be/src/modules/mentor/mentor.admin.routes.ts` (p6-03 admin.md §3). Mọi route
 * cần cờ `mentor` (tắt → `404 CFG_005`).
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const mentorPostModerationApi = {
  /** GET (`moderation:view`) — bài + nhóm + người đăng + số đơn chờ/cố vấn đang hoạt động/báo cáo mở. */
  detail: (postId: string) => `/admin/mentor/posts/${seg(postId)}`,
  /** POST (`moderation:update`) `{ reason }` — ẩn bài, đơn chờ → EXPIRED, đóng báo cáo mở, audit `mentor.post-hide`. */
  hide: (postId: string) => `/admin/mentor/posts/${seg(postId)}/hide`,
  /** POST (`moderation:update`) `{ reason }` — khôi phục, audit `mentor.post-unhide`. */
  unhide: (postId: string) => `/admin/mentor/posts/${seg(postId)}/unhide`,
} as const;

/** Mã BE khi cờ `mentor` tắt (route bị `requireFeature` chặn). */
export const MENTOR_FEATURE_OFF_CODE = 'CFG_005';
