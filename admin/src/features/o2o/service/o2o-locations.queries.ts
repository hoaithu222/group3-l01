import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import type { AdminLocationsParams } from '../types/o2o.types';
import { o2oKeys, useInvalidateO2o } from './o2o.keys';
import { o2oService } from './o2o.service';

/** `GET /admin/locations` (phân trang server). */
export const useAdminLocations = (params: AdminLocationsParams) =>
  useQuery({
    queryKey: o2oKeys.locations(params),
    queryFn: () => o2oService.listLocations(params),
    placeholderData: keepPreviousData,
  });

/** `GET /admin/locations/:id` — chỉ tải khi ngăn kéo mở. 404 không tự khỏi khi gọi lại → không retry. */
export const useAdminLocation = (id: string | undefined) =>
  useQuery({
    queryKey: o2oKeys.location(id ?? ''),
    queryFn: () => o2oService.getLocation(id ?? ''),
    select: (res) => res.data,
    enabled: !!id,
    retry: false,
  });

/** `GET /admin/locations/:id/reviews` (cursor) — nối trang bằng "Tải thêm". */
export const useLocationReviews = (id: string | undefined, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: o2oKeys.reviews(id ?? ''),
    queryFn: ({ pageParam }) => o2oService.listReviews(id ?? '', pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: enabled && !!id,
  });

export const useCreateLocation = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.createLocation,
    onSuccess: () => {
      showToast('success', 'Đã tạo địa điểm và ghi nhật ký');
      invalidate();
    },
  });
};

/** PATCH — làm mới cả khi lỗi (`RES_003` = vừa bị sửa ở nơi khác → cần `version` mới). */
export const useUpdateLocation = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.updateLocation,
    onSuccess: () => showToast('success', 'Đã lưu địa điểm và ghi nhật ký'),
    onSettled: invalidate,
  });
};

export const useSetLocationHidden = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.setLocationHidden,
    onSuccess: (_res, vars) =>
      showToast('success', vars.hidden ? 'Đã ẩn địa điểm và ghi nhật ký' : 'Đã hiện lại địa điểm'),
    onSettled: invalidate,
  });
};

export const useSetReviewHidden = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.setReviewHidden,
    onSuccess: (_res, vars) =>
      showToast(
        'success',
        vars.hidden ? 'Đã ẩn đánh giá — điểm trung bình đã tính lại' : 'Đã hiện lại đánh giá',
      ),
    onSettled: invalidate,
  });
};
