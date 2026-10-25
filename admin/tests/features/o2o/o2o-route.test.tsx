/**
 * Route `/o2o` trên router THẬT của app (guard + layout + lazy-load) — p6-05 admin.md §1, §4: mount khi có `o2o:view`; cờ `o2o` tắt → trang
 * "Chưa bật"; thiếu quyền → `/403`; deep link `/o2o/:tab/:id` chuyển về tab với ngăn kéo (tab lạ → gốc); đổi tab xoá bộ lọc của tab cũ.
 */
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import {
  LOCATION_ID,
  makeLocation,
  makeShop,
  okBody,
  ORDER_ID,
  pageMeta,
  SHOP_ID,
  signIn,
} from './o2o-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let o2oEnabled = true;

const server = setupServer(
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: { features: { o2o: { enabled: o2oEnabled, available: true } } },
    }),
  ),
  http.get('*/admin/locations', () => okBody([makeLocation()], pageMeta(1))),
  http.get('*/admin/print-shops', () => okBody([makeShop()], pageMeta(1))),
  http.get('*/admin/print-orders', () => okBody([], pageMeta(0))),
);

/**
 * Chip tab trên THANH HEADER thật (role `banner`) — dải tab của trang lên header thành LINK, tab đang mở mang
 * `aria-current="page"`. Khoanh trong header vì Dock cũng có link trùng tên module. Truy vấn lại mỗi lần gọi: header
 * chỉ có chip sau khi route lazy tải xong.
 */
const headerTab = (name: string, filter: { current?: 'page' } = {}) =>
  within(screen.getByRole('banner')).getByRole('link', { name, ...filter });

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { router, ...utils };
}

describe('route /o2o', { timeout: 20_000 }, () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 8000 });
    server.listen({ onUnhandledRequest: 'bypass' });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    server.close();
  });
  beforeEach(() => {
    o2oEnabled = true;
    useAuthStore.getState().clearAuth();
    queryClient.clear();
  });
  afterEach(() => server.resetHandlers());

  it('registry: cờ o2o, audience ops (mặc định), route con :tab/:id ẩn khỏi menu; partner audience partner + orders/:id', () => {
    const o2o = MODULE_REGISTRY.find((m) => m.id === 'o2o');
    expect(o2o?.featureFlag).toBe('o2o');
    expect(o2o?.audience ?? 'ops').toBe('ops');
    expect(o2o?.routes?.find((r) => r.path === ':tab/:id')?.hideInMenu).toBe(true);

    const partner = MODULE_REGISTRY.find((m) => m.id === 'partner');
    expect(partner?.featureFlag).toBe('o2o');
    expect(partner?.audience).toBe('partner');
    expect(partner?.routes?.find((r) => r.path === 'orders/:id')?.hideInMenu).toBe(true);
  });

  it('/o2o mount tab Địa điểm mặc định khi có o2o:view', async () => {
    signIn(['o2o:view']);
    renderApp('/o2o');
    expect(await screen.findByRole('link', { name: 'Cà phê Sách' })).toBeInTheDocument();
    expect(headerTab('Địa điểm', { current: 'page' })).toBeInTheDocument();
  });

  it('đổi tab XOÁ bộ lọc/trang của tab cũ (status=HIDDEN của địa điểm không rò sang tab Tiệm in)', async () => {
    signIn(['o2o:view']);
    const { router } = renderApp('/o2o?tab=locations&status=HIDDEN&page=2&q=cafe');
    await waitFor(() => expect(headerTab('Tiệm in')).toBeInTheDocument());
    // Chip giờ là LINK: `href` (chuột giữa / Ctrl+click mở thẻ mới) cũng không được mang bộ lọc của tab cũ.
    expect(headerTab('Tiệm in')).toHaveAttribute('href', '/o2o?tab=shops');
    await userEvent.setup().click(headerTab('Tiệm in'));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=shops'));
    expect(await screen.findByRole('link', { name: 'In nhanh Bách Khoa' })).toBeInTheDocument();
  });

  it.each([
    ['shops', SHOP_ID, 'shopId'],
    ['locations', LOCATION_ID, 'locationId'],
    ['orders', ORDER_ID, 'orderId'],
  ])('deep link /o2o/%s/:id → ?tab=%s&%s=', async (tab, id, param) => {
    signIn(['o2o:view']);
    const { router } = renderApp(`/o2o/${tab}/${id}`);
    await waitFor(() => expect(router.state.location.pathname).toBe('/o2o'));
    const search = new URLSearchParams(router.state.location.search);
    expect(search.get('tab')).toBe(tab);
    expect(search.get(param)).toBe(id);
  });

  it('deep link với :tab lạ (kể cả tên thuộc tính của Object) → về gốc /o2o', async () => {
    signIn(['o2o:view']);
    const { router } = renderApp(`/o2o/constructor/${SHOP_ID}`);
    await waitFor(() => expect(router.state.location.pathname).toBe('/o2o'));
    expect(router.state.location.search).toBe('');
  });

  it('thiếu o2o:view → /403', async () => {
    signIn(['user:view']);
    const { router } = renderApp('/o2o');
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
  });

  it('cờ o2o tắt → trang "Chưa bật"', async () => {
    o2oEnabled = false;
    signIn(['o2o:view']);
    renderApp('/o2o');
    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cà phê Sách' })).not.toBeInTheDocument();
  });
});
