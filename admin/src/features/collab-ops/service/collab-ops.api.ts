/**
 * Đường dẫn admin soạn thảo cộng tác — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp
 * `be/src/modules/documents/collab-admin.routes.ts`: xem `integration:view`, dọn snapshot `system-config:update`.
 * BE KHÔNG gắn cờ `collab` cho nhóm này (vận hành cần thấy service chạy/không trước khi bật phân hệ).
 */
export const collabOpsApi = {
  /** GET → `{ enabled, status, detail? }` — BE gọi `GET /health` của service collab (timeout 3 giây). */
  health: '/admin/collab/health',
  /** GET → `{ enabled, live: { connections, documents, pendingStates } | null }`. */
  stats: '/admin/collab/stats',
  /** GET `?limit` (1–50, mặc định 20) → top tài liệu theo dung lượng state, CHỈ metadata. */
  largeDocuments: '/admin/collab/documents/large',
  /** POST `{ reason }` (10–500 ký tự) → `{ scanned, pruned }`; audit `collab.cleanup-snapshots`. */
  cleanupSnapshots: '/admin/collab/cleanup-snapshots',
} as const;
