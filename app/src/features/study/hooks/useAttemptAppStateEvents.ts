import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useConnectionState } from '@/core/socket';

import { mockKeys, useRecordMockEvent } from '../queries/mock-attempts.queries';
import { useMockPlayerStore } from '../store/mock-player.store';
import { newLocalId } from '../utils/local-id';

/**
 * Ghi `BACKGROUND`/`FOREGROUND` khi rời/vào app lúc đang thi (`POST /mock-attempts/:id/events`, app.md p4-02 §4 "Rời app").
 * Chỉ để thống kê (`backgroundCount/Ms` ở màn kết quả) — không chặn bài thi.
 *
 * · Sự kiện vào hàng đợi của `mock-player.store` TRƯỚC khi gửi (bền qua tắt app), gửi tuần tự giữ thứ tự; lỗi MẠNG thì
 *   giữ lại gửi bù (cùng `clientEventId` — BE idempotent), lỗi HTTP thì bỏ (gửi lại vô ích, không lặp vô hạn).
 * · `FOREGROUND` còn làm mới `detail`: lấy `serverNow` mới cho đồng hồ, và phát hiện lượt ĐÃ TỰ NỘP lúc app ở nền
 *   (màn thi thấy kết quả thì chuyển sang màn kết quả).
 */
export function useAttemptAppStateEvents(attemptId: string, active: boolean): void {
  const { mutateAsync } = useRecordMockEvent(attemptId);
  const queryClient = useQueryClient();
  const online = useConnectionState() !== 'offline';
  const last = useRef<AppStateStatus>(AppState.currentState);
  const sending = useRef(false);

  const drain = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      const queued = useMockPlayerStore.getState().attempts[attemptId]?.events ?? [];
      for (const event of [...queued]) {
        try {
          await mutateAsync(event);
        } catch (error) {
          if (!isAxiosError(error) || !error.response) return; // mất mạng: giữ hàng đợi, gửi bù sau
        }
        useMockPlayerStore.getState().removeEvents(attemptId, [event.clientEventId]);
      }
    } finally {
      sending.current = false;
    }
  }, [attemptId, mutateAsync]);

  useEffect(() => {
    if (!active) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      const wasActive = last.current === 'active';
      last.current = next;
      let type: 'BACKGROUND' | 'FOREGROUND' | null = null;
      if (wasActive && next !== 'active') type = 'BACKGROUND';
      else if (!wasActive && next === 'active') type = 'FOREGROUND';
      if (!type) return;
      useMockPlayerStore.getState().pushEvent(attemptId, {
        at: new Date().toISOString(),
        clientEventId: newLocalId('mock-ev'),
        type,
      });
      if (type === 'FOREGROUND') {
        void queryClient.refetchQueries({ queryKey: mockKeys.detail(attemptId) });
      }
      void drain();
    });
    return () => sub.remove();
  }, [active, attemptId, drain, queryClient]);

  // Hàng đợi khôi phục từ đĩa (lần mở trước bị tắt giữa chừng) và mỗi lần mạng trở lại.
  useEffect(() => {
    if (active && online) void drain();
  }, [active, online, drain]);
}
