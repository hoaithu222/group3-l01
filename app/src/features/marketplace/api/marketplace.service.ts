import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  ME_LISTINGS_PATH,
  ME_PURCHASES_PATH,
  MARKETPLACE_LISTINGS_PATH,
  MY_STUDY_SETS_PATH,
  listingBuyPath,
  listingDetailPath,
  listingReportPath,
} from './marketplace.api';
import type {
  BuyListingResult,
  CreateListingInput,
  Listing,
  ListingDetail,
  ListingReportReason,
  ListingSort,
  ListingsPage,
  MyStudySetOption,
  Purchase,
  PurchasesPage,
  UpdateListingInput,
} from './marketplace.types';

/** Mọi lời gọi `skipErrorToast: true` — màn tự hiện lỗi bằng câu `COIN_*`/`RES_*` của feature (`utils/marketplace-errors.ts`), tránh toast trùng lặp. */
const QUIET = { skipErrorToast: true } as const;

export const marketplaceService = {
  async listings(params: {
    cursor?: string;
    limit: number;
    q?: string;
    contentType?: Listing['contentType'];
    sort: ListingSort;
  }): Promise<ListingsPage> {
    const response = await apiClient.get<ListingsPage>(MARKETPLACE_LISTINGS_PATH, { ...QUIET, params });
    return { data: response.data.data, meta: response.data.meta };
  },

  async detail(id: string): Promise<ListingDetail> {
    return unwrapData<ListingDetail>(await apiClient.get(listingDetailPath(id), QUIET));
  },

  async create(input: CreateListingInput, idempotencyKey: string): Promise<Listing> {
    return unwrapData<Listing>(
      await apiClient.post(MARKETPLACE_LISTINGS_PATH, input, { ...QUIET, headers: { 'Idempotency-Key': idempotencyKey } })
    );
  },

  async update(id: string, input: UpdateListingInput): Promise<Listing> {
    return unwrapData<Listing>(await apiClient.patch(listingDetailPath(id), input, QUIET));
  },

  async withdraw(id: string): Promise<Listing> {
    return unwrapData<Listing>(await apiClient.delete(listingDetailPath(id), QUIET));
  },

  /** `Idempotency-Key` BẮT BUỘC. `COIN_001` thiếu xu · `COIN_002` đã mua · `COIN_006` tự mua/chợ đóng · `COIN_008` chợ chưa mở. */
  async buy(id: string, idempotencyKey: string): Promise<BuyListingResult> {
    return unwrapData<BuyListingResult>(
      await apiClient.post(listingBuyPath(id), undefined, { ...QUIET, headers: { 'Idempotency-Key': idempotencyKey } })
    );
  },

  async report(id: string, reason: ListingReportReason, description?: string): Promise<void> {
    await apiClient.post(listingReportPath(id), { reason, description }, QUIET);
  },

  async myListings(params: { cursor?: string; limit: number }): Promise<ListingsPage> {
    const response = await apiClient.get<ListingsPage>(ME_LISTINGS_PATH, { ...QUIET, params });
    return { data: response.data.data, meta: response.data.meta };
  },

  async myPurchases(params: { cursor?: string; limit: number }): Promise<PurchasesPage> {
    const response = await apiClient.get<PurchasesPage>(ME_PURCHASES_PATH, { ...QUIET, params });
    return { data: response.data.data, meta: response.data.meta };
  },

  /**
   * Bộ học PUBLIC của tôi (gọi THẲNG endpoint `study` — không import feature đó, xem `marketplace.api.ts`). Tải MỘT trang lớn rồi lọc
   * `visibility PUBLIC` + `status ACTIVE` ở máy (danh mục "bộ học của tôi" hiếm khi vượt vài chục — đơn giản hoá thay vì cuộn vô hạn trong tấm chọn).
   */
  async myPublicStudySets(): Promise<MyStudySetOption[]> {
    const response = await apiClient.get<{
      data: { id: string; title: string; visibility: string; status: string; itemCount: number }[];
    }>(MY_STUDY_SETS_PATH, { ...QUIET, params: { scope: 'mine', limit: 100 } });
    return response.data.data
      .filter((s) => s.visibility === 'PUBLIC' && s.status === 'ACTIVE')
      .map((s) => ({ id: s.id, title: s.title, itemCount: s.itemCount }));
  },
};

export type { Purchase };
