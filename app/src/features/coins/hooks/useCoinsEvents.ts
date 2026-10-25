import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import { coinsKeys } from '../queries/coins.keys';
import { applyCoinsEvent, coinsChangeOf } from '../utils/coins-events';
import { useCoinsEnabled } from './useCoinsEnabled';

/**
 * Đồng bộ ví theo thời gian thực (app.md p7-02 §4). Nghe `gamification:updated` (`user:{id}` — MỌI thiết bị của tôi) và chỉ xử lý dạng có `coins`
 * (dạng XP/cấp/huy hiệu là việc của `GamificationEventHost`, ngược lại host đó bỏ qua dạng chỉ-`coins` — hai bên cùng nghe một sự kiện, không giẫm nhau).
 * Vá số dư vào cache rồi làm mới ví bằng `GET /me/wallet` (`applyCoinsEvent`); sự kiện chỉ để nhanh, không phải nguồn sự thật.
 *
 * Làm mới ví khi socket nối lại và khi app về `active` — sự kiện phát lúc offline không được phát lại.
 * ⚠️ Gắn ở MỖI nơi hiển thị số dư (layout `me/coins`, widget Trang chủ, hàng ở màn Tôi): nghe trùng thì vô hại (`setQueryData` lặp lại cùng giá trị,
 * `invalidate` gộp thành một lượt tải), còn KHÔNG gắn thì widget ở Trang chủ đứng yên cho tới lần lấy nét sau.
 */
export function useCoinsEvents() {
  const enabled = useCoinsEnabled();
  const queryClient = useQueryClient();

  useSocketEvent<unknown>(SocketEvent.GAMIFICATION_UPDATED, (event) => {
    if (!enabled) return;
    const change = coinsChangeOf(event);
    if (change) applyCoinsEvent(queryClient, change);
  });

  useSocketEvent('connect', () => {
    if (enabled) void queryClient.invalidateQueries({ queryKey: coinsKeys.wallet() });
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: coinsKeys.wallet() });
    });
    return () => subscription.remove();
  }, [enabled, queryClient]);
}
