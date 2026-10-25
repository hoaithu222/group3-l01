/**
 * Đồ dùng chung cho các bài kiểm phân hệ `economy` (p7-02 admin.md §4): fixture theo ĐÚNG hợp đồng BE (`OverviewDto`, `WalletDto`,
 * `AdminCoinTransactionDto`, `AdminShopItemDto`, `AdminRuleDto`, `AdminQuestDto`) và hàm dựng MSW/router.
 *
 * Tệp `.tsx` không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type {
  AdminCoinQuest,
  AdminCoinRule,
  AdminShopItem,
} from '@/features/economy/types/economy-catalog.types';
import type {
  AdminCoinTransaction,
  CoinWalletSummary,
  EconomyOverviewData,
} from '@/features/economy/types/economy.types';

/** Id hợp lệ (24 hex) của người dùng dùng trong bài kiểm. */
export const USER_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta && { meta }) });

export const errorBody = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ success: false, error: { code, message, details } }, { status });

export const cursorMeta = (nextCursor: string | null = null, limit = 20) => ({
  nextCursor,
  hasMore: nextCursor !== null,
  limit,
});

export const pageMeta = (total: number, page = 1, limit = 8) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

export function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  // Vai KHÔNG phải `admin` — `admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền.
  useAuthStore.getState().setAuth({
    user: { id: 'ops1', email: 'ops@congty.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Dựng router bộ nhớ quanh một phần tử; trả `router` để đọc URL (`router.state.location`). */
export function renderAt(ui: ReactElement, url: string) {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [url] });
  const queryClient = makeQueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, ...utils };
}

/** Giá trị một khoá query trong URL hiện tại của router. */
export const urlParam = (router: ReturnType<typeof createMemoryRouter>, key: string): string | null =>
  new URLSearchParams(router.state.location.search).get(key);

const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}`;

export function makeOverview(over: Partial<EconomyOverviewData> = {}): EconomyOverviewData {
  return {
    days: 7,
    totals: { issued: 1200, spent: 800, burned: 0, adjusted: -50 },
    perDay: [21, 22, 23, 24, 25, 26, 27].map((d, i) => ({
      date: day(d),
      issued: 100 + i * 20,
      spent: 50 + i * 10,
      burned: 0,
      adjusted: i === 3 ? -50 : 0,
    })),
    circulating: 34_500,
    topItems: [
      { itemId: 'i1', code: 'khung-vang', name: 'Khung vàng', owners: 12 },
      { itemId: 'i2', code: 'goi-emoji-vui', name: 'Gói emoji vui', owners: 7 },
    ],
    reconcile: { at: '2026-09-27T02:30:00.000Z', checked: 320, mismatched: 0, sampleUserIds: [] },
    ...over,
  };
}

/** Toàn bộ số liệu bằng 0 — BE lấp 0 cho mọi ngày nên "rỗng" là dạng này. */
export const makeEmptyOverview = (): EconomyOverviewData =>
  makeOverview({
    totals: { issued: 0, spent: 0, burned: 0, adjusted: 0 },
    perDay: [21, 22, 23].map((d) => ({ date: day(d), issued: 0, spent: 0, burned: 0, adjusted: 0 })),
    circulating: 0,
    topItems: [],
    reconcile: null,
  });

export const makeWallet = (over: Partial<CoinWalletSummary> = {}): CoinWalletSummary => ({
  balance: 500,
  lifetimeEarned: 900,
  lifetimeSpent: 400,
  todayEarned: 30,
  dailyCap: 200,
  ...over,
});

export function makeTx(over: Partial<AdminCoinTransaction> = {}): AdminCoinTransaction {
  return {
    id: 't1',
    type: 'EARN_EVENT',
    amount: 20,
    balanceAfter: 520,
    refType: 'XP_EVENT',
    refId: 'TASK_COMPLETED:abc',
    at: '2026-09-27T08:15:00.000Z',
    note: null,
    actorId: null,
    counterpartyId: null,
    ...over,
  };
}

export function makeItem(over: Partial<AdminShopItem> = {}): AdminShopItem {
  return {
    id: 'i1',
    code: 'khung-vang',
    name: 'Khung vàng',
    kind: 'AVATAR_FRAME',
    price: 300,
    assetId: null,
    data: { color: '#FFB700', width: 3 },
    availableFrom: null,
    availableTo: null,
    isActive: true,
    version: 4,
    owners: 12,
    ...over,
  };
}

export const makeRule = (over: Partial<AdminCoinRule> = {}): AdminCoinRule => ({
  sourceType: 'TASK_COMPLETED',
  coins: 10,
  dailyCap: 50,
  isActive: true,
  version: 2,
  issued7d: 340,
  ...over,
});

export const makeQuest = (over: Partial<AdminCoinQuest> = {}): AdminCoinQuest => ({
  id: 'q1',
  code: 'hoan-thanh-3-task',
  title: 'Hoàn thành 3 task',
  description: 'Xong ba task trong ngày',
  metric: 'tasksDone',
  target: 3,
  coins: 20,
  isActive: true,
  order: 1,
  version: 5,
  ...over,
});
