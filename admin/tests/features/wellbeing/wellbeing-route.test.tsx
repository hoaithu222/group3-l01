/**
 * `/gamification?tab=wellbeing` trên router THẬT của app (guard + layout + lazy-load) — p7-03 admin.md §1, §4: mount khi có `gamification:view` và cờ `burnout` bật;
 * thiếu quyền → `/403` và KHÔNG gọi API sức khoẻ; cờ `burnout` tắt → tab không có mặt dù cờ `gamification` bật.
 */
import { configure, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATHS } from '@/app/config';
import { AppProvider } from '@/app/providers';
import { routes } from '@/app/router';
import { queryClient } from '@/core/config';

import { makeOverview, okBody, signIn } from './wellbeing-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let burnoutEnabled = true;
let overviewCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: {
        features: {
          gamification: { enabled: true, available: true },
          burnout: { enabled: burnoutEnabled, available: true },
        },
      },
    }),
  ),
  http.get('*/admin/wellbeing/overview', () => {
    overviewCalls += 1;
    return okBody(makeOverview());
  }),
  http.get('*/admin/xp-rules', () => okBody([])),
);

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return router;
}

// Dựng cả shell + lazy-load nên chậm hơn test đơn vị — nới ngưỡng như `economy-route.test.tsx`.
describe('route /gamification?tab=wellbeing', { timeout: 20_000 }, () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 8000 });
    server.listen({ onUnhandledRequest: 'bypass' });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    server.close();
  });
  beforeEach(() => {
    burnoutEnabled = true;
    overviewCalls = 0;
    queryClient.clear();
  });
  afterEach(() => server.resetHandlers());

  it('có gamification:view + cờ burnout bật → mount tab Sức khoẻ học tập và tải tổng quan ẩn danh', async () => {
    signIn(['gamification:view']);
    renderApp('/gamification?tab=wellbeing');

    expect(await screen.findByText('Người đang bật theo dõi')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Sức khoẻ học tập' })).toBeInTheDocument();
    expect(overviewCalls).toBeGreaterThan(0);
  });

  it('thiếu gamification:view → chuyển sang /403, KHÔNG gọi API sức khoẻ', async () => {
    signIn(['user:view']);
    const router = renderApp('/gamification?tab=wellbeing');

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
    expect(overviewCalls).toBe(0);
  });

  it('cờ burnout tắt → không có tab Sức khoẻ học tập (trang rơi về tab đầu), KHÔNG gọi API sức khoẻ', async () => {
    burnoutEnabled = false;
    signIn(['gamification:view']);
    renderApp('/gamification?tab=wellbeing');

    expect(await screen.findByRole('tab', { name: 'Luật XP', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Sức khoẻ học tập' })).not.toBeInTheDocument();
    expect(overviewCalls).toBe(0);
  });
});
