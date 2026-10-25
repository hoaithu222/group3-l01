/**
 * Đường dẫn endpoint `/admin/workspaces/:workspaceId/channels*` +
 * `/admin/channels/:channelId/*` — khớp `admin-channels.routes.ts` phía BE
 * (p1-03 be.md §4).
 */
export const workspaceChannelsApi = {
  /** GET — danh sách kênh PUBLIC + số đếm kênh riêng tư, hỗ trợ `page`/`limit`. */
  list: (workspaceId: string) => `/admin/workspaces/${workspaceId}/channels`,
  /** POST — lưu trữ cấp nền tảng, body `{ reason }`. */
  archive: (channelId: string) => `/admin/channels/${channelId}/archive`,
  /** POST — khôi phục (chỉ kênh lưu trữ MANUAL), body `{ reason }`. */
  restore: (channelId: string) => `/admin/channels/${channelId}/restore`,
} as const;
