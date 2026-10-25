/**
 * Đường dẫn endpoint `/admin/recordings` — khớp `admin-meetings.routes.ts` phía BE (p2-06 admin.md §2): `meeting:view` xem, `meeting:delete`
 * xoá (chỉ `admin`; p2-07 chuyển từ `workspace:view|delete`, hiệu lực vai trò không đổi), cờ `meeting` (tắt → 404 `CFG_005`). KHÔNG có endpoint phát/tải/URL ký nào cho admin.
 */
export const workspaceRecordingsApi = {
  /** GET `?page&limit&status&workspaceId&from&to&expiringWithinDays&includeDeleted&sort`. */
  list: '/admin/recordings',
  /** GET `?workspaceId=` — bốn thẻ tóm tắt. */
  summary: '/admin/recordings/summary',
  /** GET (chi tiết metadata) · DELETE `?reason=` (10–500 ký tự) → 204. */
  detail: (recordingId: string) => `/admin/recordings/${encodeURIComponent(recordingId)}`,
} as const;
