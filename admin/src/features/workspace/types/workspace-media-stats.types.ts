/**
 * Kiểu `GET /admin/workspaces/:workspaceId/media-stats?days=` (p2-07, tab "Cuộc gọi & họp") — khớp `WorkspaceMediaStats` phía BE
 * (`be/src/modules/admin-media-ops/entities/admin-media.types.ts`, `dtos/admin-media-stats.dto.ts`). CHỈ số lượng/thời lượng: không danh sách
 * người, không danh sách cuộc gọi. Quyền `meeting:view` (KHÔNG phải `workspace:view`), cờ `meeting` (tắt → 404 `CFG_005`).
 */
export interface WorkspaceMediaStats {
  days: number;
  meetings: { scheduled: number; held: number; cancelled: number; totalMinutes: number };
  calls: { total: number; ring: number; room: number; minutes: number };
  recordings: { ready: number; storageBytes: number };
}
