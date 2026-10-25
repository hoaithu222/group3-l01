import { useMutation } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { marketplaceService } from '../api/marketplace.service';
import type { ListingReportReason } from '../api/marketplace.types';

/** Báo cáo tin niêm yết (bản quyền/spam/nội dung sai…) — luôn hiện nút (app.md §7), kể cả tin của người mình đã mua. */
export function useReportListing(listingId: string) {
  return useMutation({
    mutationFn: (input: { reason: ListingReportReason; description?: string }) =>
      marketplaceService.report(listingId, input.reason, input.description),
    onSuccess: () => showToast('success', 'Đã gửi báo cáo. Cảm ơn bạn đã giúp giữ chợ tài liệu sạch.'),
  });
}
