import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { coinsService } from '../api/coins.service';
import type { CoinTxType } from '../api/coins.types';
import { TRANSACTIONS_PAGE_SIZE, WALLET_STALE_MS } from '../constants/coins.constants';
import { useCoinsEnabled } from '../hooks/useCoinsEnabled';
import { coinsKeys } from './coins.keys';

/**
 * Ví xu của tôi (`GET /me/wallet`). Chỉ gọi khi cờ `coins` BẬT (cờ tắt BE trả 404). `retry: false`: lỗi hiện ngay với "Thử lại" thay vì treo skeleton
 * qua ba lần thử — cùng luật `useXpEvents`. Số dư đổi giữa hai lần tải do socket (`useCoinsEvents`) và do chính mutation của feature vá cache.
 */
export function useWallet() {
  const enabled = useCoinsEnabled();
  return useQuery({
    enabled,
    queryFn: () => coinsService.wallet(),
    queryKey: coinsKeys.wallet(),
    retry: false,
    staleTime: WALLET_STALE_MS,
  });
}

/** Lịch sử xu (cursor, mới → cũ), lọc theo loại. `type` nằm trong key nên mỗi tab một danh sách riêng — đổi tab không tải lại tab kia. */
export function useTransactions(type: CoinTxType | undefined) {
  const enabled = useCoinsEnabled();
  return useInfiniteQuery({
    // ⚠️ `queryFn` trước `getNextPageParam`: TypeScript suy kiểu trang theo thứ tự khai báo.
    queryFn: ({ pageParam }) =>
      coinsService.transactions({ cursor: pageParam, limit: TRANSACTIONS_PAGE_SIZE, type }),
    queryKey: coinsKeys.transactions(type),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled,
    retry: false,
    staleTime: WALLET_STALE_MS,
  });
}
