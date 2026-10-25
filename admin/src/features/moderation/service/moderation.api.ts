/**
 * Đường dẫn endpoint kiểm duyệt phía admin — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`).
 * Khớp `be/src/modules/moderation/admin-moderation.routes.ts` (p1-08 be.md §4).
 */

/** `id` từ URL/BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const moderationApi = {
  /** GET (`moderation:view`) — hàng đợi gộp theo đích: `page/limit/status/targetType/workspaceId/reason/from/to/sort`. */
  list: '/admin/reports',
  /** GET (`moderation:view`) — chi tiết một nhóm; `:reportId` là báo cáo đại diện của nhóm. */
  detail: (reportId: string) => `/admin/reports/${seg(reportId)}`,
  /**
   * GET (`moderation:approve`, D-06) — nội dung riêng tư ±3 tin. MỖI LẦN GỌI BE ghi audit
   * `moderation.view-private` và thông báo người trong cuộc ⇒ chỉ gọi sau khi người dùng xác nhận.
   */
  content: (reportId: string) => `/admin/reports/${seg(reportId)}/content`,
  /** PATCH (`moderation:update`, `LOCK_AUTHOR` thêm `user:update`) — body `{ action, reason }`. */
  act: (reportId: string) => `/admin/reports/${seg(reportId)}`,
  /** POST (`moderation:update`) — gỡ một tin cấp nền tảng, body `{ reason }`. */
  removeMessage: (messageId: string) => `/admin/messages/${seg(messageId)}/remove`,
  /** GET (`workspace:view`) — chỉ để dựng ô lọc workspace; hợp đồng của phân hệ workspace. */
  workspaces: '/admin/workspaces',
} as const;
