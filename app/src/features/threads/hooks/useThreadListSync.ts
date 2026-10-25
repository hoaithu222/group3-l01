import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import { threadKeys } from '../queries/threads.keys';

/** Gộp các sự kiện dồn dập (kênh sôi nổi: mỗi tin trả lời là một `thread:updated`) thành MỘT lượt tải lại. */
const REFRESH_DELAY_MS = 1500;

/**
 * Giữ danh sách luồng của một kênh đúng khi màn ĐANG mở: có phản hồi mới (`thread:updated` — đổi số phản hồi, thứ tự và người trả lời gần nhất), theo dõi đổi từ máy khác
 * (`thread:subscription-updated` — luồng vào/ra tab "Đang theo dõi") và socket nối lại (sự kiện lúc ngắt đã mất hẳn). Không vá tại chỗ: hàng phải NHẢY thứ tự và đổi tab, `invalidate` mới đúng
 * (`api-patterns.md`); trailing-debounce vì `thread:updated` không có `channelId` để lọc nên sự kiện của kênh khác cũng chỉ tốn một lượt tải gộp.
 */
export function useThreadListSync(channelId: string): void {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void queryClient.invalidateQueries({ queryKey: threadKeys.lists(channelId) });
    }, REFRESH_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useSocketEvent(SocketEvent.THREAD_UPDATED, refresh);
  useSocketEvent(SocketEvent.THREAD_SUBSCRIPTION_UPDATED, refresh);
  useSocketEvent('connect', refresh);
}
