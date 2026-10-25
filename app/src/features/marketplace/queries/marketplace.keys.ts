import type { Listing, ListingSort } from '../api/marketplace.types';

/** Khoá cache chợ tài liệu — tiền tố RIÊNG `['marketplace', …]`, KHÔNG chung với `['coins', …]` (feature khác, tuy cùng module BE `coins`). */
export const marketplaceKeys = {
  all: ['marketplace'] as const,
  listings: (filter: { q: string | undefined; contentType: Listing['contentType'] | undefined; sort: ListingSort }) =>
    ['marketplace', 'listings', filter] as const,
  detail: (id: string) => ['marketplace', 'listing', id] as const,
  myListings: () => ['marketplace', 'me', 'listings'] as const,
  myPurchases: () => ['marketplace', 'me', 'purchases'] as const,
  myStudySets: () => ['marketplace', 'me', 'study-sets'] as const,
};
