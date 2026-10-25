import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { PENDING_LISTINGS_PAGE_SIZE } from '../constants/economy.constants';
import type { ShopItemKind, WalletTxParams } from '../types/economy.types';
import { economyService } from './economy.service';

/**
 * Query key theo admin.md p7-02 §3: `['economy','overview',range]`, `['economy','items']`, `['economy','rules']`, `['economy','quests']`,
 * `['economy','user-tx',userId,cursor]` — ví và sổ cái của MỘT người gom dưới `['economy','user',userId]` để một lần điều chỉnh làm mới cả hai.
 */
export const economyKeys = {
  all: ['economy'] as const,
  overviewAll: () => ['economy', 'overview'] as const,
  overview: (days: number) => ['economy', 'overview', days] as const,
  userAll: (userId: string) => ['economy', 'user', userId] as const,
  wallet: (userId: string) => ['economy', 'user', userId, 'wallet'] as const,
  userTx: (userId: string, type: string | undefined, cursor: string | undefined) =>
    ['economy', 'user', userId, 'tx', type ?? null, cursor ?? null] as const,
  itemsAll: () => ['economy', 'items'] as const,
  items: (kind: ShopItemKind | undefined) => ['economy', 'items', kind ?? null] as const,
  rules: () => ['economy', 'rules'] as const,
  quests: () => ['economy', 'quests'] as const,
  pendingListingsAll: () => ['economy', 'pending-listings'] as const,
  pendingListings: (cursor: string | undefined) =>
    ['economy', 'pending-listings', cursor ?? null] as const,
  reportedListingsAll: () => ['economy', 'reported-listings'] as const,
  reportedListings: (cursor: string | undefined) =>
    ['economy', 'reported-listings', cursor ?? null] as const,
  settings: () => ['economy', 'settings'] as const,
};

/** `GET /admin/economy/overview?days` — đổi khoảng thì giữ số cũ mờ đi tới khi số mới về (`isPlaceholderData`). */
export const useEconomyOverview = (days: number) =>
  useQuery({
    queryKey: economyKeys.overview(days),
    queryFn: () => economyService.overview(days),
    select: (res) => res.data,
    placeholderData: keepPreviousData,
  });

/** `GET /admin/economy/users/:userId/wallet` — 404 (người dùng không tồn tại) không tự khỏi khi gọi lại nên không thử lại. */
export const useUserWallet = (userId: string) =>
  useQuery({
    queryKey: economyKeys.wallet(userId),
    queryFn: () => economyService.userWallet(userId),
    select: (res) => res.data,
    retry: false,
  });

/** `GET /admin/economy/users/:userId/transactions` (cursor). */
export const useUserTransactions = (params: WalletTxParams) =>
  useQuery({
    queryKey: economyKeys.userTx(params.userId, params.type, params.cursor),
    queryFn: () => economyService.userTransactions(params),
    placeholderData: keepPreviousData,
  });

/** `GET /admin/economy/shop-items` — không phân trang ở BE (danh mục nhỏ); bảng phân trang phía client. */
export const useShopItems = (kind: ShopItemKind | undefined) =>
  useQuery({
    queryKey: economyKeys.items(kind),
    queryFn: () => economyService.listItems(kind),
    select: (res) => res.data,
    placeholderData: keepPreviousData,
  });

/** `GET /admin/economy/rules` — chỉ các luật ĐÃ có; nguồn chưa có luật do giao diện tự bổ sung dòng trống. */
export const useCoinRules = () =>
  useQuery({
    queryKey: economyKeys.rules(),
    queryFn: economyService.listRules,
    select: (res) => res.data,
  });

/** `GET /admin/economy/quests`. */
export const useCoinQuests = () =>
  useQuery({
    queryKey: economyKeys.quests(),
    queryFn: economyService.listQuests,
    select: (res) => res.data,
  });

/** `GET /admin/economy/listings` (cursor, chỉ `PENDING_REVIEW`) — chợ tài liệu (P1). */
export const usePendingListings = (cursor: string | undefined) =>
  useQuery({
    queryKey: economyKeys.pendingListings(cursor),
    queryFn: () => economyService.pendingListings({ cursor, limit: PENDING_LISTINGS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

/** `GET /admin/economy/listings/reported` (cursor offset) — tin ĐANG bán/ĐÃ ẩn có báo cáo, nhiều báo cáo nhất trước. */
export const useReportedListings = (cursor: string | undefined) =>
  useQuery({
    queryKey: economyKeys.reportedListings(cursor),
    queryFn: () => economyService.reportedListings({ cursor, limit: PENDING_LISTINGS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

/** `GET /admin/system-config/economy` — bật/tắt chợ + phí % + cấp tối thiểu tự duyệt. */
export const useEconomySettings = () =>
  useQuery({
    queryKey: economyKeys.settings(),
    queryFn: economyService.getSettings,
    select: (res) => res.data,
  });
