import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import type { WalletSummaryView } from '../api';
import { walletKeys } from '../queries/wallet.keys';

/** Payload `wallet:updated` (p6-04 be.md §6) — ⛔ KHÔNG kèm số tiền, chỉ báo "có thay đổi". */
export interface WalletUpdatedPayload {
  v: 1;
  workspaceId: string;
  walletVersion: number;
  changedUserIds: string[];
  reason: 'EXPENSE' | 'SETTINGS' | 'SETTLEMENT';
  serverNow: string;
}

/** Gộp nhiều sự kiện dồn dập (một khoản chi + settlement liền nhau) thành MỘT lượt làm mới. */
const DEBOUNCE_MS = 500;

/**
 * Đồng bộ cache ví theo `wallet:updated` (app.md §4).
 *
 * Chỉ làm mới khi `walletVersion` MỚI HƠN bản đang cache: chính lượt ghi của mình
 * đã làm mới xong TRƯỚC khi sự kiện dội lại, nên sự kiện đó được bỏ qua thay vì
 * gây thêm một vòng tải thừa. Chưa có bản cache nào (`undefined`) hoặc đổi CÀI ĐẶT
 * (`SETTINGS` không chắc tăng `walletVersion`) thì luôn làm mới.
 *
 * Sự kiện tới `user:{id}` của từng thành viên MEMBER+ (không còn `ws:{id}`) — hook
 * chỉ nghe theo TÊN sự kiện nên không phụ thuộc phòng; lọc theo `workspaceId` vì
 * người dùng thuộc nhiều nhóm và sự kiện của nhóm khác cũng tới đây.
 */
export function useWalletSocket(wsId: string | undefined): void {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSocketEvent<WalletUpdatedPayload>(SocketEvent.WALLET_UPDATED, (payload) => {
    if (!wsId || payload.workspaceId !== wsId) return;

    const known = queryClient.getQueryData<WalletSummaryView>(
      walletKeys.summary(wsId),
    )?.walletVersion;
    const stale =
      known === undefined || payload.walletVersion > known || payload.reason === 'SETTINGS';
    if (!stale) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void queryClient.invalidateQueries({ queryKey: walletKeys.ws(wsId) });
    }, DEBOUNCE_MS);
  });

  // Socket bị ngắt khi app ở nền (`bindAppState`) rồi nối lại: `wallet:updated` trong lúc ngắt là MẤT HẲN (khoản chi/thanh toán
  // của người khác) — lấy lại cả ví của nhóm, cùng cách `useCoinsEvents`/`useOfferEvents`.
  useSocketEvent('connect', () => {
    if (wsId) void queryClient.invalidateQueries({ queryKey: walletKeys.ws(wsId) });
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
