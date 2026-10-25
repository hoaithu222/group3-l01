/**
 * Đường dẫn endpoint `/admin/workspaces/:workspaceId/meetings` — khớp `admin-meetings.routes.ts` phía BE
 * (p2-04 admin.md §2.1): `workspace:view` + cờ `meeting` (tắt → 404 `CFG_005`); chỉ đọc, chỉ metadata.
 */
export const workspaceMeetingsApi = {
  /** GET `?page&limit&status&from&to` — phân trang server, `startAt` mới → cũ. */
  list: (workspaceId: string) => `/admin/workspaces/${encodeURIComponent(workspaceId)}/meetings`,
} as const;
