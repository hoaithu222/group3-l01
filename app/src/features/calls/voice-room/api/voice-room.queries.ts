import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { voiceRoomKeys } from './voice-room.keys';
import { voiceRoomService } from './voice-room.service';

/**
 * Preview phòng thoại của một kênh. `staleTime` 10 s (app.md §4): cập nhật realtime do `useVoicePreviewLive` vá, còn đây là lưới an
 * toàn khi socket rơi. 404 (`CALL_001`) = kênh không còn thấy được — màn hình hiện "Kênh không còn khả dụng", không thử lại;
 * lỗi mạng thử lại một lần như mặc định của app.
 */
export function useVoicePreview(channelId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(channelId),
    queryFn: () => voiceRoomService.getPreview(channelId),
    queryKey: voiceRoomKeys.preview(channelId),
    retry: (failureCount, error) => failureCount < 1 && !(isAxiosError(error) && error.response?.status === 404),
    staleTime: 10_000,
  });
}
