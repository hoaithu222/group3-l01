import { useCallback } from 'react';

import { getMeetingMedia } from '../media/meeting-media.registry';
import type { MeetingMediaPort } from '../media/meeting-media.types';

/**
 * Hàm vẽ video cho component thuần (`renderVideo` — component KHÔNG import cổng media để test không cần SDK). Bọc lại thay vì `bind` để
 * luôn gọi ĐÚNG cổng hiện hành (test thay bằng bản giả sau khi màn đã dựng).
 */
export function useRenderVideo(): MeetingMediaPort['renderVideo'] {
  return useCallback((videoRef, style) => getMeetingMedia().renderVideo(videoRef, style), []);
}
