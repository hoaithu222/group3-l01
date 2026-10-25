import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { newIdempotencyKey, shouldRotateIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { showToast } from '@/shared/utils/toast.utils';

import { marketplaceService } from '../api/marketplace.service';
import type { ListingDetail } from '../api/marketplace.types';
import { marketplaceErrorCode } from '../utils/marketplace-errors';
import { marketplaceKeys } from '../queries/marketplace.keys';

/**
 * Mua tài liệu bằng xu. `Idempotency-Key` sinh MỘT lần cho mỗi listing và GIỮ khi thử lại sau lỗi mạng/5xx — cùng luật `useBuyItem`
 * (`features/coins`): đổi khoá sau khi BE đã CHỐT câu trả lời (4xx/thành công, `shouldRotateIdempotencyKey`).
 *
 * `COIN_001/002/006/008` đều làm mới chi tiết listing (đã mua/chợ đóng thay đổi ngay dưới chân người dùng); `COIN_001` còn làm mới ví
 * (`['coins','wallet']` — feature khác nhưng cùng số dư, tên khoá khai lại ở đây để không import `@/features/coins`).
 */
export function useBuyListing() {
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());

  return useMutation({
    mutationFn: async (listing: ListingDetail) => {
      const key = keys.current.get(listing.id) ?? newIdempotencyKey('marketplace-buy', listing.id);
      keys.current.set(listing.id, key);
      try {
        const result = await marketplaceService.buy(listing.id, key);
        keys.current.delete(listing.id);
        return result;
      } catch (error) {
        if (shouldRotateIdempotencyKey(error)) keys.current.delete(listing.id);
        throw error;
      }
    },
    onError: (error) => {
      const code = marketplaceErrorCode(error);
      if (code === 'COIN_001') void queryClient.invalidateQueries({ queryKey: ['coins', 'wallet'] });
      if (code && ['COIN_001', 'COIN_002', 'COIN_006', 'COIN_008'].includes(code)) {
        void queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
      }
    },
    onSuccess: (_result, listing) => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.detail(listing.id) });
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.myPurchases() });
      void queryClient.invalidateQueries({ queryKey: ['coins', 'wallet'] });
      showToast('success', `Đã mua "${listing.title}". Xem trong "Đã mua".`);
    },
  });
}
