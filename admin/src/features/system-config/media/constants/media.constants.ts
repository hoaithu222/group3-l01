import type { MediaHealth } from '../types/media-status.types';

/** Mã lỗi BE khi thiếu cấu hình `LIVEKIT_*` (`error.codes.ts`, HTTP 503). */
export const MEDIA_NOT_CONFIGURED_CODE = 'MEDIA_001';

/** Chu kỳ tự làm mới khi tab đang mở (admin.md p0-08 §2) — dừng khi tab trình duyệt ẩn. */
export const MEDIA_STATUS_REFETCH_MS = 30_000;

/**
 * Trên ngưỡng này (ms) coi máy chủ media là "Chậm". BE chỉ trả số đo, không có ngưỡng —
 * 1 giây cho một lời gọi `listRooms` nội bộ là dấu hiệu rõ ràng của nghẽn mạng/quá tải.
 */
export const MEDIA_SLOW_LATENCY_MS = 1000;

export const MEDIA_HEALTH_META: Readonly<
  Record<MediaHealth, { label: string; color: 'success' | 'warning' | 'error' | 'neutral' }>
> = {
  OK: { label: 'Hoạt động', color: 'success' },
  SLOW: { label: 'Chậm', color: 'warning' },
  UNREACHABLE: { label: 'Không kết nối', color: 'error' },
  NOT_CONFIGURED: { label: 'Chưa cấu hình', color: 'neutral' },
};

/** Cờ tính năng liên quan (khoá `capabilities.features`) → nhãn hiển thị. */
export const MEDIA_RELATED_FLAGS: ReadonlyArray<{ flag: string; label: string }> = [
  { flag: 'voice', label: 'Gọi thoại/video' },
  { flag: 'meeting', label: 'Lịch họp/phòng họp' },
];

/** Đích link sang tab "Tính năng" để bật/tắt cờ. */
export const MEDIA_FEATURES_TAB_HREF = '/system-config?tab=features';
