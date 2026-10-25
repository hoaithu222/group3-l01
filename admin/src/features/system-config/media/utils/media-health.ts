import { MEDIA_SLOW_LATENCY_MS } from '../constants/media.constants';
import type { MediaHealth, MediaStatus } from '../types/media-status.types';

/**
 * Suy trạng thái tổng hợp. `status = undefined` khi máy chủ chưa cấu hình (`MEDIA_001`, xem
 * `MediaTab`) — BE không trả body dạng 200 trong trường hợp đó.
 */
export function deriveMediaHealth(status: MediaStatus | undefined): MediaHealth {
  if (!status || !status.configured) return 'NOT_CONFIGURED';
  if (!status.reachable) return 'UNREACHABLE';
  if (status.latencyMs !== null && status.latencyMs >= MEDIA_SLOW_LATENCY_MS) return 'SLOW';
  return 'OK';
}
