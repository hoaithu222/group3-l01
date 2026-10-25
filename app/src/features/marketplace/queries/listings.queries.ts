import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { marketplaceService } from '../api/marketplace.service';
import type { Listing, ListingSort } from '../api/marketplace.types';
import { LISTINGS_PAGE_SIZE, LISTINGS_STALE_MS } from '../constants/marketplace.constants';
import { useMarketplaceEnabled } from '../hooks/useMarketplaceEnabled';
import { marketplaceKeys } from './marketplace.keys';

export interface ListingsFilter {
  q?: string;
  contentType?: Listing['contentType'];
  sort: ListingSort;
}

/** Chợ tài liệu — tin ĐANG bán (cursor mới → cũ / phổ biến / giá, tuỳ `sort`). `COIN_008` (chợ chưa mở) hiện qua `query.error`, màn tự dịch câu. */
export function useListings(filter: ListingsFilter) {
  const enabled = useMarketplaceEnabled();
  return useInfiniteQuery({
    queryFn: ({ pageParam }) =>
      marketplaceService.listings({ cursor: pageParam, limit: LISTINGS_PAGE_SIZE, q: filter.q, contentType: filter.contentType, sort: filter.sort }),
    queryKey: marketplaceKeys.listings({ q: filter.q, contentType: filter.contentType, sort: filter.sort }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled,
    retry: false,
    staleTime: LISTINGS_STALE_MS,
  });
}

/** Chi tiết tin niêm yết + trạng thái đã mua + preview. */
export function useListingDetail(listingId: string | null) {
  const enabled = useMarketplaceEnabled() && listingId !== null;
  return useQuery({
    enabled,
    queryFn: () => marketplaceService.detail(listingId ?? ''),
    queryKey: marketplaceKeys.detail(listingId ?? ''),
    retry: false,
    staleTime: LISTINGS_STALE_MS,
  });
}
