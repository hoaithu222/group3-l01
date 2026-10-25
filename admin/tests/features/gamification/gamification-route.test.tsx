/**
 * Route `/gamification` và `/gamification/badges/:badgeId` trên router THẬT của app (guard + layout + lazy-load) — p4-03 admin.md §1, §4:
 * mount khi có `gamification:view`, thiếu quyền → `/403`, cờ `gamification` tắt → trang "Chưa bật" (cả tab lẫn deep link ngăn kéo), deep link
 * huy hiệu chuyển về tab Huy hiệu và mở ngăn kéo.
 */
import { configure, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATHS } from '@/app/config';
import { AppProvider } from '@/app/providers';
import { routes } from '@/app/router';
import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import { useAuthStore } from '@/app/store';
import { queryClient } from '@/core/config';

import { makeBadge, okBody, pageMeta, urlParam } from './gamification-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let gamificationEnabled = true;

const server = setupServer(
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: { gamification: { enabled: gamificationEnabled, available: true } } } })),
  http.get('*/admin/badges/:id', () => okBody(makeBadge())),
  http.get('*/admin/badges', () => okBody([makeBadge()], pageMeta(1))),
  http.get('*/admin/xp-rules', () => okBody([])),
);

function signInWith(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  // Vai KHÔNG phải `admin` — `admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền.
  useAuthStore.getState().setAuth({
    user: { id: 'ops1', email: 'ops@congty.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return router;
}

// Dựng cả shell + lazy-load nên chậm hơn test đơn vị — nới ngưỡng như `app-routes.test.tsx`.
describe('route /gamification', { timeout: 20_000 }, () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 8000 });
    server.listen({ onUnhandledRequest: 'bypass' });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    server.close();
  });
  beforeEach(() => {
    gamificationEnabled = true;
    queryClient.clear();
  });
  afterEach(() => server.resetHandlers());

  it('registry: cờ gamification, đủ tab, có route con badges/:badgeId (ẩn khỏi menu)', () => {
    const mod = MODULE_REGISTRY.find((m) => m.id === 'gamification');
    expect(mod?.featureFlag).toBe('gamification');
    expect(Object.keys(mod?.tabTitles ?? {})).toEqual(expect.arrayContaining(['xp-rules', 'badges', 'levels', 'leaderboard']));
    const detail = mod?.routes?.find((r) => r.path === 'badges/:badgeId');
    expect(detail?.title).toBe('Chi tiết huy hiệu');
    expect(detail?.hideInMenu).toBe(true);
  });

  it('có gamification:view → /gamification?tab=badges mount tab Huy hiệu và hiện dữ liệu', async () => {
    signInWith(['gamification:view']);
    const router = renderApp('/gamification?tab=badges');

    expect(await screen.findByText('Chăm chỉ')).toBeInTheDocument();
    expect(await screen.findByPlaceholderText('Tìm theo tên huy hiệu…')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/gamification');
  });

  it('deep link /gamification/badges/:id → về /gamification?tab=badges&badgeId=… và mở ngăn kéo', async () => {
    signInWith(['gamification:view']);
    const router = renderApp('/gamification/badges/b1');

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Task hoàn thành ≥ 50')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/gamification');
    expect(urlParam(router, 'tab')).toBe('badges');
    expect(urlParam(router, 'badgeId')).toBe('b1');
  });

  it('thiếu gamification:view → chuyển sang /403, KHÔNG mount trang (cả deep link)', async () => {
    signInWith(['user:view']);
    const router = renderApp('/gamification/badges/b1');

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
    expect(screen.queryByText('Chăm chỉ')).not.toBeInTheDocument();
  });

  it('cờ gamification tắt → trang "Chưa bật" cho cả tab lẫn deep link ngăn kéo', async () => {
    gamificationEnabled = false;
    signInWith(['gamification:view']);
    const first = renderApp('/gamification?tab=badges');
    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
    expect(screen.queryByText('Chăm chỉ')).not.toBeInTheDocument();
    first.dispose();
  });

  it('cờ tắt + deep link /gamification/badges/:id → cũng "Chưa bật", không mở ngăn kéo', async () => {
    gamificationEnabled = false;
    signInWith(['gamification:view']);
    renderApp('/gamification/badges/b1');
    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
