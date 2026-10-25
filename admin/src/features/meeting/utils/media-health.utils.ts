import { MEDIA_HEALTH_OVERALL } from '../constants/media-health.constants';
import type { MediaHealth } from '../types/media-health.types';

export type MediaOverallView = (typeof MEDIA_HEALTH_OVERALL)[keyof typeof MEDIA_HEALTH_OVERALL];

/**
 * Nội dung khung tổng trạng thái. BE luôn báo `DEGRADED` (không bao giờ `DOWN`) ở mức tổng khi một phần lỗi để endpoint vẫn trả 200 (OPC-07), nên
 * "LiveKit không truy cập được" phải đọc từ `livekit.status = DOWN`: khi đó hiện khung ĐỎ ("cuộc gọi mới sẽ thất bại") thay vì khung vàng chung chung.
 */
export function overallViewOf(health: Pick<MediaHealth, 'status' | 'livekit'>): MediaOverallView {
  if (health.livekit.status === 'DOWN') return MEDIA_HEALTH_OVERALL.DOWN;
  return MEDIA_HEALTH_OVERALL[health.status];
}
