/**
 * Route `/moderation` và `/moderation/:id` trên router THẬT của app (guard + layout + lazy-load) —
 * p1-08 admin.md §1, §4: mount khi có `moderation:view`, thiếu quyền → `/403`, cờ `communication`
 * tắt → trang "Chưa bật", và registry không còn là placeholder.
 */
import { configure, render, screen } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATHS } from '@/app/config';
import { AppProvider } from '@/app/providers';
import { routes } from '@/app/router';
import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import { useAuthStore } from '@/app/store';
import { queryClient } from '@/core/config';

import {
  makeDetail,
  makeGroup,
  okJson,
  pageMeta,
  PERM_VIEW,
  REPORT_ID,
} from './moderation-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('./fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let communicationEnabled = true;

const server = setupServer(
  http.get('*/capabilities', () =>
    okJson({ features: { communication: { enabled: communicationEnabled, available: true } } }),
  ),
  http.get('*/admin/reports/:id', () => okJson(makeDetail())),
  http.get('*/admin/reports', () => okJson([makeGroup()], pageMeta(1))),
  http.get('*/audit-logs', () => okJson([], { nextCursor: null, hasMore: false, limit: 20 })),
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
describe('route /moderation', { timeout: 20_000 }, () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 8000 });
    server.listen({ onUnhandledRequest: 'bypass' });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    server.close();
  });
  beforeEach(() => {
    communicationEnabled = true;
    queryClient.clear();
  });
  afterEach(() => server.resetHandlers());

  it('registry: trang thật (không còn placeholder), có route chi tiết :id, cờ communication, tab reports', () => {
    const mod = MODULE_REGISTRY.find((m) => m.id === 'moderation');

    expect(mod?.featureFlag).toBe('communication');
    expect(mod?.subtitle).toBeTruthy();
    // p4-01: thêm tab `content` (bộ học công khai bị báo cáo nhiều) — trang chỉ hiện khi cờ `study` bật.
    expect(mod?.tabTitles).toEqual({ reports: 'Báo cáo', content: 'Nội dung công khai' });
    expect(mod?.defaultTab).toBe('reports');
    expect(String(mod?.page.lazy)).not.toContain('PlaceholderPage');
    const detail = mod?.routes?.find((r) => r.path === ':id');
    expect(detail?.title).toBe('Chi tiết báo cáo');
    expect(detail?.hideInMenu).toBe(true);
  });

  it('có moderation:view → mount hàng đợi ở /moderation và hiện dữ liệu', async () => {
    signInWith(PERM_VIEW);
    const router = renderApp('/moderation');

    expect(await screen.findByText('Hàng đợi báo cáo')).toBeInTheDocument();
    expect(await screen.findByText('#general')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/moderation');
  });

  it('/moderation/:id → mount trang chi tiết', async () => {
    signInWith(PERM_VIEW);
    const router = renderApp(`/moderation/${REPORT_ID}`);

    expect(await screen.findByText('Ngữ cảnh')).toBeInTheDocument();
    expect(await screen.findByText('Quyết định')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/moderation/${REPORT_ID}`);
  });

  it('thiếu moderation:view → chuyển sang /403, KHÔNG mount trang', async () => {
    signInWith(['user:view']);
    const router = renderApp('/moderation');

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
    expect(screen.queryByText('Hàng đợi báo cáo')).not.toBeInTheDocument();
  });

  it('cờ communication tắt → trang "Chưa bật" (cả hàng đợi lẫn chi tiết)', async () => {
    communicationEnabled = false;
    signInWith(PERM_VIEW);
    renderApp('/moderation');

    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
    expect(screen.queryByText('Hàng đợi báo cáo')).not.toBeInTheDocument();
  });
});
