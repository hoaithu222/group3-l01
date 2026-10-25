/**
 * Đường dẫn tab "Cố vấn" của workspace — khớp `be/src/modules/mentor/mentor.admin.routes.ts` (p6-03 admin.md §3). Mọi route cần cờ `mentor`
 * (tắt → `404 CFG_005`). Ẩn/khôi phục bài nằm ở `features/moderation` (kiểm duyệt), không lặp ở đây.
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const workspaceMentorApi = {
  /** GET (`workspace:view`) — bài tìm cố vấn + đợt cố vấn của nhóm (không lời nhắn ứng tuyển). */
  overview: (workspaceId: string) => `/admin/workspaces/${seg(workspaceId)}/mentor`,
  /** POST `{ reason }` (`workspace:update`) — kết thúc đợt cấp nền tảng, audit `mentor.engagement-end-platform`; `MENTOR_009` đợt đã kết thúc. */
  endEngagement: (engagementId: string) => `/admin/mentor/engagements/${seg(engagementId)}/end`,
} as const;
