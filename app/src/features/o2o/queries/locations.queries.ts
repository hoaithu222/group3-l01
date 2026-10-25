import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { locationsService } from '../api/locations.service';
import type { LatLng } from '../api/o2o.types';
import { MAP_TUNING } from '../constants/o2o.constants';
import { roundLatLng } from '../utils/geo';
import { o2oKeys, type NearFilters } from './o2o.keys';

/**
 * Địa điểm quanh `center` (app.md §4). Gửi lên BE chính toạ độ ĐÃ LÀM TRÒN (cùng giá trị với khoá cache) — nhờ vậy hai truy vấn cùng khoá
 * luôn trả cùng kết quả, và toạ độ người dùng rời máy ở độ chính xác ~110 m thay vì mét.
 *
 * `placeholderData: keepPreviousData` — kéo bản đồ/đổi lọc thì danh sách CŨ còn nguyên tới khi có bản mới (không nháy khung xương giữa
 * lúc người dùng đang đọc). `staleTime` 60 s: quán không đổi chỗ từng phút.
 */
export function useNearbyLocations(center: LatLng, filters: NearFilters) {
  const rounded = roundLatLng(center);
  return useQuery({
    queryKey: o2oKeys.near(rounded, filters),
    queryFn: () =>
      locationsService.near({
        ...rounded,
        radiusM: filters.radiusM,
        type: filters.type,
        amenities: filters.amenities,
        openNow: filters.openNow,
      }),
    placeholderData: keepPreviousData,
    staleTime: MAP_TUNING.nearStaleMs,
  });
}

export function useLocationDetail(locationId: string | undefined) {
  return useQuery({
    queryKey: o2oKeys.location(locationId ?? ''),
    queryFn: () => locationsService.detail(locationId as string),
    enabled: Boolean(locationId),
    staleTime: 30_000,
    // 404 (`O2O_010`: ẩn/không còn) là câu trả lời dứt khoát — thử lại chỉ làm màn "không còn hiển thị" hiện chậm.
    retry: false,
  });
}

/** Danh sách đầy đủ các đánh giá (tờ "Xem tất cả") — chỉ tải khi tờ mở (`enabled`). */
export function useLocationReviews(locationId: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: o2oKeys.reviews(locationId ?? ''),
    queryFn: ({ pageParam }) => locationsService.reviews(locationId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: enabled && Boolean(locationId),
    staleTime: 30_000,
  });
}
