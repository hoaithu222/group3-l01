/**
 * Kiểu dữ liệu vận hành soạn thảo cộng tác (p6-01 admin.md §2.1) — khớp 4 route của
 * `be/src/modules/documents/collab-admin.routes.ts` + `services/collab-admin.service.ts`
 * (`CollabAdminService`) và `be/src/shared/collab/collab.client.ts` (`CollabHealth`, `stats`).
 * Viết tay vì `openapi.json` chưa sinh kiểu cho nhóm này (p0-09); thay bằng kiểu sinh khi có.
 *
 * ⛔ Quyền riêng tư (admin.md §2.1): admin KHÔNG đọc nội dung tài liệu. `LargeDocumentRow.title` là `null`
 * với tài liệu PRIVATE (BE che) — giao diện cũng KHÔNG in tiêu đề của tài liệu PRIVATE dù BE lỡ trả kèm.
 */

/** `disabled` = chưa cấu hình `COLLAB_INTERNAL_URL`/`COLLAB_SHARED_SECRET` (BE không gọi mạng); `down` = không phản hồi. */
export type CollabServiceStatus = 'ok' | 'degraded' | 'down' | 'disabled';

/** Thân `GET /health` của service `collab/` (`collab/src/internal/router.ts`) — mọi trường tuỳ chọn: `degraded` do HTTP lỗi chỉ có `httpStatus`. */
export interface CollabHealthDetail {
  status?: string;
  service?: string;
  version?: string;
  instance?: string;
  uptimeSeconds?: number;
  /** Loại tài nguyên service phục vụ (`document`, `whiteboard`). */
  kinds?: string[];
  connections?: number;
  documents?: number;
  pendingStates?: number;
  redis?: string;
  be?: { lastOkAt: string | null; lastErrorAt: string | null };
  httpStatus?: number;
}

/** `GET /admin/collab/health` → `data`. */
export interface CollabHealthView {
  enabled: boolean;
  status: CollabServiceStatus;
  detail?: CollabHealthDetail;
}

/** Số liệu tức thời theo loại tài nguyên (`document`, `whiteboard`). */
export interface CollabLiveStats {
  connections: Record<string, number>;
  documents: Record<string, number>;
  /** State đã chỉnh nhưng CHƯA lưu xuống BE. */
  pendingStates: number;
}

/** `GET /admin/collab/stats` → `data`. `live: null` khi chưa cấu hình hoặc service không phản hồi. */
export interface CollabStatsView {
  enabled: boolean;
  live: CollabLiveStats | null;
}

export type LargeDocumentVisibility = 'WORKSPACE' | 'PRIVATE';
export type LargeDocumentStatus = 'ACTIVE' | 'ARCHIVED';

/** Một dòng `GET /admin/collab/documents/large` — CHỈ metadata. */
export interface LargeDocumentRow {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  /** `null` với tài liệu PRIVATE. */
  title: string | null;
  visibility: LargeDocumentVisibility;
  status: LargeDocumentStatus;
  stateBytes: number;
  snapshotCount: number;
  /** ISO-8601. */
  lastEditedAt: string | null;
}

/** `POST /admin/collab/cleanup-snapshots` → `data`. */
export interface CleanupSnapshotsResult {
  scanned: number;
  pruned: number;
}
