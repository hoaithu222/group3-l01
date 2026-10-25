/**
 * Đồ dùng chung cho các bài kiểm phân hệ `wellbeing` (p7-03 admin.md §4): fixture theo ĐÚNG hợp đồng BE (`OverviewDto`, `RulesDto` — `be/src/modules/burnout/services/burnout-admin.service.ts`)
 * và hàm dựng MSW/router.
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
  BurnoutRule,
  BurnoutRules,
  WellbeingOverview,
} from '@/features/wellbeing/types/wellbeing.types';

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta && { meta }) });

export const errorBody = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ success: false, error: { code, message, details } }, { status });

export function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  // Vai KHÔNG phải `admin` — `admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền.
  useAuthStore.getState().setAuth({
    user: { id: 'ops1', email: 'ops@congty.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

/** Dựng router bộ nhớ quanh một phần tử; trả `router` để đọc URL (`router.state.location`). */
export function renderAt(ui: ReactElement, url: string) {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, ...utils };
}

/** Giá trị một khoá query trong URL hiện tại của router. */
export const urlParam = (
  router: ReturnType<typeof createMemoryRouter>,
  key: string,
): string | null => new URLSearchParams(router.state.location.search).get(key);

/** 12 tuần cũ → mới; tuần thứ 3 bị che (`null`), tuần cuối (hiện tại) có 8 cảnh báo. */
const WEEKS = Array.from({ length: 12 }, (_, i) => {
  const start = new Date(Date.UTC(2026, 6, 6 + i * 7)).toISOString().slice(0, 10);
  const alerts = i === 2 ? null : i === 11 ? 8 : i % 2 === 0 ? 0 : 6;
  return { weekStart: start, alerts };
});

/** Đủ mẫu: ≈ 120 người bật, có ô bị che, phân bố có nhóm "Khác". */
export const makeOverview = (
  over: Partial<Extract<WellbeingOverview, { insufficient: false }>> = {},
): WellbeingOverview => ({
  insufficient: false,
  optInApprox: 120,
  alertsPerWeek: WEEKS,
  levelDistribution: [
    { level: 'LOW', count: 70 },
    { level: 'MEDIUM', count: 25 },
    { level: 'OTHER', count: 7 },
  ],
  ...over,
});

export const makeInsufficient = (minimum = 20): WellbeingOverview => ({
  insufficient: true,
  minimum,
});

export const makeRule = (over: Partial<BurnoutRule> = {}): BurnoutRule => ({
  id: 'long-continuous-session',
  label: 'Làm việc liên tục quá lâu',
  metric: 'longestContinuousMinutes',
  aggregate: 'MAX',
  days: 7,
  op: 'GT',
  threshold: 180,
  points: 30,
  ...over,
});

/** Bốn luật mặc định theo đặc tả (README §7) — dùng lại cho CẢ `rules` (bộ đang lưu, khi test không tự override) LẪN `defaults` (nút "Về mặc định"). */
const DEFAULT_RULES = (): BurnoutRule[] => [
  makeRule(),
  makeRule({
    id: 'late-night-events',
    label: 'Hoạt động vào khuya nhiều lần',
    metric: 'lateNightEvents',
    aggregate: 'SUM',
    threshold: 2,
  }),
  makeRule({
    id: 'high-daily-activity',
    label: 'Thời gian hoạt động mỗi ngày cao',
    metric: 'activeMinutes',
    aggregate: 'AVG',
    threshold: 600,
    points: 20,
  }),
  makeRule({
    id: 'late-night-streak',
    label: 'Nhiều ngày liền hoạt động khuya',
    metric: 'lateNightMinutes',
    aggregate: 'CONSECUTIVE_DAYS_OVER',
    days: 3,
    threshold: 60,
    points: 20,
  }),
];

/** Bộ luật mặc định theo đặc tả (README §7) — bốn luật, cửa sổ 7 ngày, ngưỡng 40/70. `defaults` KHÔNG đổi theo `over.rules` (BE luôn trả đúng đặc tả, bất kể bộ đang lưu là gì). */
export const makeRules = (over: Partial<BurnoutRules> = {}): BurnoutRules => ({
  version: 3,
  windowDays: 7,
  levels: { medium: 40, high: 70 },
  rules: DEFAULT_RULES(),
  updatedAt: '2026-09-20T03:00:00.000Z',
  isDefault: false,
  defaults: { windowDays: 7, levels: { medium: 40, high: 70 }, rules: DEFAULT_RULES() },
  ...over,
});
