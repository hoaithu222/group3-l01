import { useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { marketplaceService } from '../api/marketplace.service';
import { marketplaceKeys } from '../queries/marketplace.keys';

/** Gỡ tin niêm yết của tôi (chuyển WITHDRAWN) — không hoàn xu cho người đã mua trước đó (chỉ hoàn khi ADMIN ẩn vì lý do bản quyền). */
export function useWithdrawListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) => marketplaceService.withdraw(listingId),
    onSuccess: (listing) => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.myListings() });
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.detail(listing.id) });
      showToast('success', 'Đã gỡ tin niêm yết.');
    },
  });
}
