/**
 * `/gamification?tab=economy` trên router THẬT của app (guard + layout + lazy-load) — p7-02 admin.md §1, §4: mount khi có `gamification:view` và cờ `coins` bật;
 * thiếu quyền → `/403`; cờ `coins` tắt → tab "Kinh tế xu" không có mặt dù cờ `gamification` bật (không gọi API xu).
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

import { makeOverview, okBody, signIn } from './economy-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let coinsEnabled = true;
let overviewCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: {
        features: {
          gamification: { enabled: true, available: true },
          coins: { enabled: coinsEnabled, available: true },
        },
      },
    }),
  ),
  http.get('*/admin/economy/overview', () => {
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

// Dựng cả shell + lazy-load nên chậm hơn test đơn vị — nới ngưỡng như `gamification-route.test.tsx`.
describe('route /gamification?tab=economy', { timeout: 20_000 }, () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 8000 });
    server.listen({ onUnhandledRequest: 'bypass' });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    server.close();
  });
  beforeEach(() => {
    coinsEnabled = true;
    overviewCalls = 0;
    queryClient.clear();
  });
  afterEach(() => server.resetHandlers());

  it('có gamification:view + cờ coins bật → mount tab Kinh tế xu và tải tổng quan', async () => {
    signIn(['gamification:view']);
    renderApp('/gamification?tab=economy');

    expect(await screen.findByText('Xu đang lưu hành')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Kinh tế xu' })).toBeInTheDocument();
    expect(overviewCalls).toBeGreaterThan(0);
  });

  it('thiếu gamification:view → chuyển sang /403, KHÔNG gọi API xu', async () => {
    signIn(['user:view']);
    const router = renderApp('/gamification?tab=economy');

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
    expect(overviewCalls).toBe(0);
  });

  it('cờ coins tắt → không có tab Kinh tế xu (trang rơi về tab đầu), KHÔNG gọi API xu', async () => {
    coinsEnabled = false;
    signIn(['gamification:view']);
    renderApp('/gamification?tab=economy');

    expect(await screen.findByRole('tab', { name: 'Luật XP', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Kinh tế xu' })).not.toBeInTheDocument();
    expect(overviewCalls).toBe(0);
  });
});
