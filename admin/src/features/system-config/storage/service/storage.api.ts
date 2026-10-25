/** Đường dẫn endpoint `/admin/storage` — khớp `admin-storage.routes.ts` phía BE (p0-05 be.md §4). */
export const storageApi = {
  /** GET — số liệu dung lượng; `?workspaceId=` để xem riêng một workspace. */
  stats: '/admin/storage/stats',
  /** POST `{ reason }` — xếp job `assets.cleanup` thủ công (tối đa 1 lượt/giờ). */
  cleanup: '/admin/storage/cleanup',
} as const;
