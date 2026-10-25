import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { newIdempotencyKey, shouldRotateIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { showToast } from '@/shared/utils/toast.utils';

import { coinsService } from '../api/coins.service';
import type { ShopListing } from '../api/coins.types';
import { useCoinsEnabled } from '../hooks/useCoinsEnabled';
import { coinErrorCode, coinErrorMessage } from '../utils/coin-errors';
import { applyPurchase } from '../utils/coins-cache';
import { coinsKeys } from './coins.keys';

/** Vật phẩm ĐANG bán + trạng thái sở hữu của tôi. Một lượt tải cho cả ba tab (danh mục nhỏ) — lọc theo loại ở máy. */
export function useShopItems() {
  const enabled = useCoinsEnabled();
  return useQuery({
    enabled,
    queryFn: () => coinsService.shopItems(),
    queryKey: coinsKeys.shop(),
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * Mua vật phẩm bằng xu. `Idempotency-Key` sinh MỘT lần cho mỗi vật phẩm và GIỮ khi thử lại sau lỗi mạng/5xx (BE chỉ trừ xu một lần — người dùng bấm lại
 * khi mạng chập chờn không bị trừ hai lần). ⚠️ BE lưu phản hồi dưới khoá 24 giờ KỂ CẢ 4xx: gửi lại cùng khoá sau `COIN_001` (thiếu xu) sẽ nhận lại đúng câu
 * "thiếu xu" dù người dùng vừa kiếm thêm — nên đổi khoá khi BE đã chốt câu trả lời (4xx hoặc thành công), xem `shouldRotateIdempotencyKey`.
 *
 * Lỗi hiện TRONG tấm xác nhận (`PurchaseConfirmSheet`, toast tự tắt sau 4 giây trong khi người dùng cần đọc "còn thiếu N xu"), trừ `COIN_003` (vật phẩm biến khỏi
 * danh sách nên tấm đóng theo — toast để câu không mất). `COIN_001/002/003` đều làm mới dữ liệu: số dư/sở hữu/danh mục ở máy đang cũ.
 */
export function useBuyItem() {
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());

  return useMutation({
    mutationFn: async (item: ShopListing) => {
      const key = keys.current.get(item.id) ?? newIdempotencyKey('shop-buy', item.id);
      keys.current.set(item.id, key);
      try {
        const result = await coinsService.buy(item.id, key);
        keys.current.delete(item.id);
        return result;
      } catch (error) {
        if (shouldRotateIdempotencyKey(error)) keys.current.delete(item.id);
        throw error;
      }
    },
    onError: (error) => {
      const code = coinErrorCode(error);
      if (code === 'COIN_003') showToast('error', coinErrorMessage(error));
      if (code === 'COIN_001') void queryClient.invalidateQueries({ queryKey: coinsKeys.wallet() });
      if (code === 'COIN_002' || code === 'COIN_003') {
        void queryClient.invalidateQueries({ queryKey: coinsKeys.shop() });
        void queryClient.invalidateQueries({ queryKey: coinsKeys.inventory() });
        void queryClient.invalidateQueries({ queryKey: coinsKeys.wallet() });
      }
    },
    onSuccess: (result, item) => {
      applyPurchase(queryClient, item.price, result);
      showToast('success', `Đã mua "${item.name}". Vào Kho đồ để trang bị.`);
    },
  });
}
