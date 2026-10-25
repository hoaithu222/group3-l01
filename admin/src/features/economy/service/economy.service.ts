import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminCoinQuest,
  AdminCoinRule,
  AdminShopItem,
  CreateQuestPayload,
  CreateShopItemPayload,
  PutCoinRulePayload,
  UpdateQuestPayload,
  UpdateShopItemPayload,
} from '../types/economy-catalog.types';
import type {
  AdjustCoinsPayload,
  AdjustCoinsResult,
  CoinTxPage,
  CoinWalletSummary,
  EconomyOverviewData,
  ShopItemKind,
  WalletTxParams,
} from '../types/economy.types';
import type {
  AdminListing,
  EconomySettingsItem,
  ListingActionPayload,
  ListingsPage,
  UpdateEconomySettingsPayload,
} from '../types/marketplace.types';
import { economyApi } from './economy.api';

/**
 * Các lệnh ĐỌC tắt toast của interceptor: màn hình tự vẽ trạng thái lỗi (`Callout` + "Thử lại", hoặc 404 "không tìm thấy") — toast
 * biến mất sau vài giây nên không thay được. Lệnh GHI để interceptor toast (kể cả `RES_003` "dữ liệu đã thay đổi, vui lòng tải lại").
 */
const OWN_ERROR: RequestConfig = { skipErrorToast: true };

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const economyService = {
  overview: async (days: number): Promise<ApiResponse<EconomyOverviewData>> =>
    (
      await apiClient.get<ApiResponse<EconomyOverviewData>>(economyApi.overview, {
        params: { days },
        ...OWN_ERROR,
      })
    ).data,

  userWallet: async (userId: string): Promise<ApiResponse<CoinWalletSummary>> =>
    (await apiClient.get<ApiResponse<CoinWalletSummary>>(economyApi.userWallet(userId), OWN_ERROR))
      .data,

  /** Thân phản hồi BE: `{ success, data: AdminCoinTransactionDto[], meta: { nextCursor, hasMore, limit } }`. */
  userTransactions: async ({ userId, ...params }: WalletTxParams): Promise<CoinTxPage> => {
    const res = await apiClient.get<CoinTxPage>(economyApi.userTransactions(userId), {
      params,
      ...OWN_ERROR,
    });
    return { data: res.data.data, meta: res.data.meta };
  },

  adjust: async ({
    userId,
    idempotencyKey,
    ...body
  }: AdjustCoinsPayload): Promise<ApiResponse<AdjustCoinsResult>> =>
    (
      await apiClient.post<ApiResponse<AdjustCoinsResult>>(economyApi.userAdjust(userId), body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
    ).data,

  listItems: async (kind?: ShopItemKind): Promise<ApiResponse<AdminShopItem[]>> =>
    (
      await apiClient.get<ApiResponse<AdminShopItem[]>>(economyApi.shopItems, {
        params: { kind },
        ...OWN_ERROR,
      })
    ).data,

  createItem: async (body: CreateShopItemPayload): Promise<ApiResponse<AdminShopItem>> =>
    (await apiClient.post<ApiResponse<AdminShopItem>>(economyApi.shopItems, body)).data,

  updateItem: async ({ id, ...body }: UpdateShopItemPayload): Promise<ApiResponse<AdminShopItem>> =>
    (await apiClient.patch<ApiResponse<AdminShopItem>>(economyApi.shopItem(id), body)).data,

  listRules: async (): Promise<ApiResponse<AdminCoinRule[]>> =>
    (await apiClient.get<ApiResponse<AdminCoinRule[]>>(economyApi.rules, OWN_ERROR)).data,

  putRule: async ({
    sourceType,
    ...body
  }: PutCoinRulePayload): Promise<ApiResponse<AdminCoinRule>> =>
    (await apiClient.patch<ApiResponse<AdminCoinRule>>(economyApi.rule(sourceType), body)).data,

  listQuests: async (): Promise<ApiResponse<AdminCoinQuest[]>> =>
    (await apiClient.get<ApiResponse<AdminCoinQuest[]>>(economyApi.quests, OWN_ERROR)).data,

  createQuest: async (body: CreateQuestPayload): Promise<ApiResponse<AdminCoinQuest>> =>
    (await apiClient.post<ApiResponse<AdminCoinQuest>>(economyApi.quests, body)).data,

  updateQuest: async ({ id, ...body }: UpdateQuestPayload): Promise<ApiResponse<AdminCoinQuest>> =>
    (await apiClient.patch<ApiResponse<AdminCoinQuest>>(economyApi.quest(id), body)).data,

  /** Thân phản hồi BE: `{ success, data: ListingDto[], meta: { nextCursor, hasMore, limit } }`. */
  pendingListings: async (params: { cursor?: string; limit: number }): Promise<ListingsPage> => {
    const res = await apiClient.get<ListingsPage>(economyApi.pendingListings, {
      params,
      ...OWN_ERROR,
    });
    return { data: res.data.data, meta: res.data.meta };
  },

  approveListing: async ({ id, reason }: ListingActionPayload): Promise<ApiResponse<AdminListing>> =>
    (await apiClient.post<ApiResponse<AdminListing>>(economyApi.listingApprove(id), { reason })).data,

  rejectListing: async ({ id, reason }: ListingActionPayload): Promise<ApiResponse<AdminListing>> =>
    (await apiClient.post<ApiResponse<AdminListing>>(economyApi.listingReject(id), { reason })).data,

  hideListing: async ({ id, reason }: ListingActionPayload): Promise<ApiResponse<AdminListing>> =>
    (await apiClient.post<ApiResponse<AdminListing>>(economyApi.listingHide(id), { reason })).data,

  restoreListing: async ({ id, reason }: ListingActionPayload): Promise<ApiResponse<AdminListing>> =>
    (await apiClient.post<ApiResponse<AdminListing>>(economyApi.listingRestore(id), { reason })).data,

  reportedListings: async (params: { cursor?: string; limit: number }): Promise<ListingsPage> => {
    const res = await apiClient.get<ListingsPage>(economyApi.reportedListings, {
      params,
      ...OWN_ERROR,
    });
    return { data: res.data.data, meta: res.data.meta };
  },

  getSettings: async (): Promise<ApiResponse<EconomySettingsItem>> =>
    (await apiClient.get<ApiResponse<EconomySettingsItem>>(economyApi.settings, OWN_ERROR)).data,

  updateSettings: async (
    payload: UpdateEconomySettingsPayload,
  ): Promise<ApiResponse<EconomySettingsItem>> =>
    (
      await apiClient.put<ApiResponse<EconomySettingsItem>>(economyApi.settings, payload, OWN_ERROR)
    ).data,
};
