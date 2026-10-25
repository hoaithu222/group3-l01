import { useMutation, useQueryClient } from '@tanstack/react-query';

import { newIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { showToast } from '@/shared/utils/toast.utils';

import { marketplaceService } from '../api/marketplace.service';
import type { CreateListingInput } from '../api/marketplace.types';
import { marketplaceKeys } from '../queries/marketplace.keys';

/** Niêm yết nội dung của tôi. `Idempotency-Key` mới MỖI LẦN gửi (một màn tạo, không cần giữ khoá qua lần mở lại như mua/xác nhận). */
export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateListingInput) => marketplaceService.create(input, newIdempotencyKey('marketplace-create')),
    onSuccess: (listing) => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.myListings() });
      showToast(
        'success',
        listing.status === 'PENDING_REVIEW' ? 'Đã gửi tin niêm yết — chờ quản trị viên duyệt.' : 'Đã đăng tin niêm yết.'
      );
    },
  });
}
