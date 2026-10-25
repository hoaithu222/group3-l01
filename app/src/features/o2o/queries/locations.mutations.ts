import { useMutation, useQueryClient } from '@tanstack/react-query';

import { locationsService } from '../api/locations.service';
import type { ReviewPayload } from '../api/o2o.types';
import { o2oKeys } from './o2o.keys';

/**
 * Đánh giá của tôi. Sau khi ghi/xoá: làm mới chi tiết địa điểm (sao trung bình, 5 đánh giá mới, `myReview`), danh sách đầy đủ và
 * danh sách "Gần tôi" (sao/độ ồn hiện ở thẻ) — cả ba đều đọc số liệu vừa đổi (app.md §4 "invalidate location").
 */
function useInvalidateLocation(locationId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: o2oKeys.location(locationId) });
    void queryClient.invalidateQueries({ queryKey: o2oKeys.nearAll() });
  };
}

export function useSaveMyReview(locationId: string) {
  const invalidate = useInvalidateLocation(locationId);
  return useMutation({
    mutationFn: (payload: ReviewPayload) => locationsService.saveMyReview(locationId, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteMyReview(locationId: string) {
  const invalidate = useInvalidateLocation(locationId);
  return useMutation({
    mutationFn: () => locationsService.deleteMyReview(locationId),
    onSuccess: invalidate,
  });
}
