import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import type { MyGamificationDto, XpEventDto } from '../api/gamification.types';

/** Đồ dùng chung cho test widget Trang chủ của `gamification`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`). */

export const profile = (overrides: Partial<MyGamificationDto> = {}): MyGamificationDto => ({
  counters: {},
  level: 12,
  levelSpan: 500,
  longestStreak: 9,
  serverNow: '2026-09-26T00:00:00.000Z',
  showcase: [],
  streak: 4,
  streakAtRisk: false,
  unseenBadges: [],
  xp: 5_000,
  xpIntoLevel: 50,
  xpToNext: 450,
  ...overrides,
});

/** Sự kiện XP `daysAgo` ngày trước (12:00 GIỜ MÁY) — dựng theo đồng hồ máy nên đúng ở mọi múi giờ. */
export const xpEvent = (daysAgo: number, xp: number, id = `e${daysAgo}-${xp}`): XpEventDto => {
  const now = new Date();
  return {
    blockedReason: null,
    capped: false,
    id,
    occurredAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - daysAgo,
      12,
      0,
    ).toISOString(),
    sourceType: 'TASK_COMPLETED',
    workspaceId: null,
    xp,
  };
};

export const eventsPage = (data: XpEventDto[]) => ({
  data,
  meta: { hasMore: false, limit: 50, nextCursor: null },
});

export async function renderWidget(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}

/** Chờ React Query xả hết việc đang treo trong `act` (tránh cảnh báo act về sau). */
export const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
