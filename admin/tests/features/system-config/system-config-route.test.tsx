/**
 * Route `/system-config` trên router THẬT của app (guard + layout + lazy-load)
 * — p0-07 admin.md §4: mount khi có `system-config:view`, tab chưa có component
 * bị ẩn, thiếu quyền → `/403`, và `tabTitles` lấy từ registry (qua route `handle`).
 */
import { configure, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PATHS } from '@/app/config';
import { AppProvider } from '@/app/providers';
import { routes } from '@/app/router';
import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import { useAuthStore } from '@/app/store';
import { queryClient } from '@/core/config';

const server = setupServer(
  http.get('*/admin/system-config', () => HttpResponse.json({ success: true, data: [] })),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: {} } })),
  http.get('*/admin/media/status', () =>
    HttpResponse.json({
      success: true,
      data: {
        configured: true,
        reachable: true,
        latencyMs: 42,
        rooms: { active: 2, participants: 5 },
        egress: { active: 0, failed24h: 0 },
        lastWebhookAt: null,
      },
    }),
  ),
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
describe('route /system-config', { timeout: 20_000 }, () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 8000 });
    server.listen({ onUnhandledRequest: 'bypass' });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    server.close();
  });
  beforeEach(() => queryClient.clear());
  afterEach(() => server.resetHandlers());

  it('registry: trang thật, tab dự kiến nằm trong tabTitles (pm thêm lại ở Phase 3; ai/economy vẫn bỏ)', () => {
    const mod = MODULE_REGISTRY.find((m) => m.id === 'system-config');
    expect(Object.keys(mod?.tabTitles ?? {})).toEqual(
      expect.arrayContaining(['limits', 'features', 'storage', 'notifications', 'media', 'jobs', 'pm']),
    );
    expect(mod?.tabTitles?.pm).toBe('Dự án');
    expect(mod?.tabTitles).not.toHaveProperty('ai');
    expect(mod?.tabTitles).not.toHaveProperty('economy');
    expect(mod?.defaultTab).toBe('limits');
  });

  it('có system-config:view → mount trang, mở tab mặc định; tab Media (p0-08) đã đăng ký nên hiện', async () => {
    signInWith(['system-config:view']);
    const router = renderApp('/system-config');

    expect(
      await screen.findByRole('tab', { name: 'Giới hạn', selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tính năng' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Media' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/system-config');
  });

  it('?tab=media → mount tab Media với system-config:view (p0-08), hiện sức khoẻ máy chủ', async () => {
    signInWith(['system-config:view']);
    renderApp('/system-config?tab=media');

    expect(await screen.findByRole('tab', { name: 'Media', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Sức khoẻ máy chủ media')).toBeInTheDocument();
    expect(await screen.findByText('Hoạt động')).toBeInTheDocument();
  });

  it('?tab=features → mở đúng tab', async () => {
    signInWith(['system-config:view']);
    renderApp('/system-config?tab=features');

    expect(
      await screen.findByRole('tab', { name: 'Tính năng', selected: true }),
    ).toBeInTheDocument();
  });

  it('thiếu system-config:view → chuyển sang /403, KHÔNG mount trang', async () => {
    signInWith(['user:view']);
    const router = renderApp('/system-config');

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
    expect(screen.queryByRole('tab', { name: 'Giới hạn' })).not.toBeInTheDocument();
  });
});
