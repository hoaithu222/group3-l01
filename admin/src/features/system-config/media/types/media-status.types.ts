/**
 * Kiểu dữ liệu tab "Media" — khớp `MediaStatus` của
 * `be/src/modules/media-admin/media-admin.service.ts` (`GET /admin/media/status`, p0-08).
 *
 * Viết tay vì `openapi.json` chưa được sinh (p0-09); thay bằng kiểu sinh khi p0-09 xong.
 *
 * ⛔ CHỈ số liệu tổng hợp: BE không trả khoá API/secret LiveKit và không trả định danh
 * người/phòng — UI cũng không dựng thêm. `tests/features/system-config/media-status-tab.test.tsx`
 * khoá điều đó (D-24).
 */

export interface MediaRoomsStatus {
  /** Số phòng đang mở trên máy chủ media. */
  active: number;
  /** Tổng người đang ở trong các phòng đó. */
  participants: number;
}

export interface MediaEgressStatus {
  /** Egress đang chạy (STARTING/ACTIVE/ENDING). */
  active: number;
  /** Egress lỗi/bị huỷ kết thúc trong 24 giờ qua. */
  failed24h: number;
}

/**
 * `GET /admin/media/status` → `data`. Khi CHƯA cấu hình BE không trả 200 mà trả `503 MEDIA_001`
 * (xem `MEDIA_NOT_CONFIGURED_CODE`), nên `configured` ở phản hồi 200 luôn `true`.
 */
export interface MediaStatus {
  configured: boolean;
  /** `false` = đã cấu hình nhưng không với tới máy chủ media (200, không phải lỗi). */
  reachable: boolean;
  /** Độ trễ gọi `listRooms` (ms); `null` khi không với tới. */
  latencyMs: number | null;
  /** `null` khi không với tới máy chủ. */
  rooms: MediaRoomsStatus | null;
  /** `null` khi máy chủ chạy không kèm egress, hoặc không đọc được. */
  egress: MediaEgressStatus | null;
  /** ISO-8601 — webhook LiveKit gần nhất BE đã ghi nhận; `null` = chưa nhận cái nào. */
  lastWebhookAt: string | null;
}

/** Trạng thái tổng hợp để chọn badge/Callout (suy từ phản hồi + mã lỗi, xem `utils/media-health.ts`). */
export type MediaHealth = 'OK' | 'SLOW' | 'UNREACHABLE' | 'NOT_CONFIGURED';
