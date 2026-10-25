import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { marketplaceService } from '../api/marketplace.service';
import { PURCHASES_PAGE_SIZE, LISTINGS_PAGE_SIZE } from '../constants/marketplace.constants';
import { useMarketplaceEnabled } from '../hooks/useMarketplaceEnabled';
import { marketplaceKeys } from './marketplace.keys';

/** Tin niêm yết của tôi (mọi trạng thái — Chờ duyệt/Đang bán/Đã ẩn/Đã gỡ), cursor mới → cũ. */
export function useMyListings() {
  const enabled = useMarketplaceEnabled();
  return useInfiniteQuery({
    queryFn: ({ pageParam }) => marketplaceService.myListings({ cursor: pageParam, limit: LISTINGS_PAGE_SIZE }),
    queryKey: marketplaceKeys.myListings(),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled,
    retry: false,
  });
}

/** Tài liệu tôi đã mua, cursor mới → cũ. */
export function useMyPurchases() {
  const enabled = useMarketplaceEnabled();
  return useInfiniteQuery({
    queryFn: ({ pageParam }) => marketplaceService.myPurchases({ cursor: pageParam, limit: PURCHASES_PAGE_SIZE }),
    queryKey: marketplaceKeys.myPurchases(),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled,
    retry: false,
  });
}

/** Bộ học PUBLIC của tôi — nguồn cho `ContentPickerSheet` khi niêm yết. */
export function useMyPublicStudySets() {
  const enabled = useMarketplaceEnabled();
  return useQuery({
    enabled,
    queryFn: () => marketplaceService.myPublicStudySets(),
    queryKey: marketplaceKeys.myStudySets(),
    retry: false,
    staleTime: 30_000,
  });
}
