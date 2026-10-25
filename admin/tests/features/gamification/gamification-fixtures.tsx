/**
 * Đồ dùng chung cho các bài kiểm phân hệ `gamification` (p4-03 admin.md §4): fixture theo ĐÚNG hợp đồng BE
 * (`BadgeAdminDto`, `AdminXpEventDto`, `LeaderboardResult`) và hàm dựng MSW/router.
 *
 * Tệp `.tsx` không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type { AdminBadge, LeaderboardEntry, UserGamificationOverview } from '@/features/gamification/types/gamification.types';

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta && { meta }) });

export const errorBody = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message } }, { status });

export const pageMeta = (total: number, page = 1, limit = 20) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

export function makeBadge(over: Partial<AdminBadge> = {}): AdminBadge {
  return {
    id: 'b1',
    code: 'tasks-50',
    name: 'Chăm chỉ',
    description: 'Hoàn thành nhiều task',
    emoji: '💪',
    iconAssetId: null,
    rarity: 'COMMON',
    criteria: { all: [{ counter: 'tasksDone', op: 'gte', value: 50 }] },
    counters: ['tasksDone'],
    isActive: true,
    order: 1,
    version: 3,
    unlockedCount: 37,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T08:30:00.000Z',
    ...over,
  };
}

export function makeEntry(over: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, 'userId' | 'name'>): LeaderboardEntry {
  return { rank: 1, avatarAssetId: null, level: 3, xp: 420, ...over };
}

export function makeOverview(over: Partial<UserGamificationOverview> = {}): UserGamificationOverview {
  return {
    summary: { xp: 420, level: 3, xpIntoLevel: 37, xpToNext: 480, streak: 4, longestStreak: 9 },
    badges: [],
    xpEvents: [],
    xpEventsMeta: { nextCursor: null, hasMore: false, limit: 20 },
    ...over,
  };
}

export function signIn(permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Quản lý', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Dựng router bộ nhớ quanh một phần tử; trả `router` để đọc URL (`router.state.location`). */
export function renderAt(ui: ReactElement, url: string, extraRoutes: RouteObject[] = []) {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }, ...extraRoutes], { initialEntries: [url] });
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
