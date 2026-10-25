/**
 * Cổng chủ tiệm `/partner` trên router THẬT của app (guard + layout + lazy-load + socket giả) — p6-05 admin.md §1, §2.4, §4: audience `partner`
 * (chủ tiệm chỉ thấy module `partner`; vận hành không thấy), quyền `partner:view`, cờ `o2o`; ba tab (Đơn hàng · Bảng giá chỉ đọc · Tài khoản
 * với bật/tắt nhận đơn + âm báo); socket `partner:order` làm mới hàng đợi + báo toast + số đơn mới trên tiêu đề tab; chi tiết `/partner/orders/:id`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, render, renderHook, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATHS } from '@/app/config';
import { AppProvider } from '@/app/providers';
import { routes } from '@/app/router';
import { useAccessibleModules } from '@/app/router/permission/useAccessibleModules';
import { useAuthStore } from '@/app/store';
import { queryClient } from '@/core/config';

import { emitFromServer } from '../moderation/fake-socket';
import {
  cursorMeta,
  errorBody,
  makeOrder,
  makeShop,
  okBody,
  ORDER_ID,
  signIn,
  SHOP_ID,
} from './partner-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let o2oEnabled = true;
let queueCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: { features: { o2o: { enabled: o2oEnabled, available: true } } },
    }),
  ),
  http.get('*/partner/shops/me', () => okBody([makeShop()])),
  http.get('*/partner/orders/:id', ({ params }) =>
    params.id === ORDER_ID ? okBody(makeOrder()) : errorBody(404, 'RES_001', 'Không tìm thấy'),
  ),
  http.get('*/partner/orders', () => {
    queueCalls += 1;
    return okBody([makeOrder()], cursorMeta());
  }),
);

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { router, ...utils };
}

describe('cổng chủ tiệm /partner', { timeout: 20_000 }, () => {
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
    queueCalls = 0;
    useAuthStore.getState().clearAuth();
    queryClient.clear();
    window.localStorage.clear();
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  it('/partner mount tab Đơn hàng mặc định với hàng đợi khi có partner:view', async () => {
    signIn();
    renderApp('/partner');
    expect(await screen.findByRole('link', { name: 'PO-7K2M9Q' })).toBeInTheDocument();
    // Dải tab nằm trên THANH HEADER thật: chip tab là link, tab đang mở mang `aria-current="page"`.
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Đơn hàng', current: 'page' }),
    ).toBeInTheDocument();
  });

  it('thiếu partner:view (vd vận hành chỉ có o2o:view) → /403', async () => {
    signIn(['o2o:view']);
    const { router } = renderApp('/partner');
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
  });

  it('cờ o2o tắt → trang "Chưa bật"', async () => {
    o2oEnabled = false;
    signIn();
    renderApp('/partner');
    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
  });

  it('tab Bảng giá: CHỈ ĐỌC, nói rõ liên hệ vận hành để đổi', async () => {
    signIn();
    renderApp('/partner?tab=prices');
    expect(await screen.findByText('A4 đen trắng (mỗi trang)')).toBeInTheDocument();
    expect(screen.getByText(/Liên hệ vận hành để thay đổi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lưu/ })).not.toBeInTheDocument();
  });

  it('tab Tài khoản: tắt nhận đơn → POST /accepting { acceptingOrders: false }', async () => {
    signIn();
    const bodies: unknown[] = [];
    server.use(
      http.post(`*/partner/shops/${SHOP_ID}/accepting`, async ({ request }) => {
        bodies.push(await request.json());
        return okBody({ id: SHOP_ID, acceptingOrders: false });
      }),
    );
    renderApp('/partner?tab=account');
    const toggle = await screen.findByRole('switch', { name: 'Đang nhận đơn mới' });
    await userEvent.setup().click(toggle);
    await waitFor(() => expect(bodies).toEqual([{ acceptingOrders: false }]));
  });

  it('tab Tài khoản: tiệm đang chờ duyệt → công tắc nhận đơn bị khoá; tắt âm báo lưu localStorage', async () => {
    signIn();
    server.use(http.get('*/partner/shops/me', () => okBody([makeShop({ status: 'PENDING' })])));
    renderApp('/partner?tab=account');
    expect(await screen.findByRole('switch', { name: 'Đang nhận đơn mới' })).toBeDisabled();
    const sound = screen.getByRole('switch', { name: 'Phát âm báo khi có đơn mới' });
    expect(sound).toBeChecked();
    await userEvent.setup().click(sound);
    await waitFor(() =>
      expect(window.localStorage.getItem('partner:new-order-sound')).toBe('false'),
    );
  });

  it('socket partner:order → làm mới hàng đợi + toast "Có đơn in mới <mã>"', async () => {
    signIn();
    renderApp('/partner');
    await screen.findByRole('link', { name: 'PO-7K2M9Q' });
    const before = queueCalls;
    act(() => {
      emitFromServer('partner:order', {
        shopId: SHOP_ID,
        orderId: 'x',
        code: 'PO-NEWNEW',
        status: 'PENDING',
        pages: 3,
        total: 1500,
        submittedAt: '2026-09-20T02:00:00.000Z',
      });
    });
    expect(await screen.findByText('Có đơn in mới PO-NEWNEW')).toBeInTheDocument();
    await waitFor(() => expect(queueCalls).toBeGreaterThan(before));
  });

  it('tab trình duyệt đang ẨN: tiêu đề nhận "(N) Đơn in mới", trả lại khi tab hiện lại', async () => {
    signIn();
    renderApp('/partner');
    await screen.findByRole('link', { name: 'PO-7K2M9Q' });
    document.title = 'Tiệm in | Super App';
    const base = document.title;
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
      act(() => {
        emitFromServer('partner:order', {
          shopId: SHOP_ID,
          orderId: 'x',
          code: 'PO-A',
          status: 'PENDING',
          pages: 1,
          total: 1,
          submittedAt: null,
        });
        emitFromServer('partner:order', {
          shopId: SHOP_ID,
          orderId: 'y',
          code: 'PO-B',
          status: 'PENDING',
          pages: 1,
          total: 1,
          submittedAt: null,
        });
      });
      expect(document.title).toBe(`(2) Đơn in mới · ${base}`);
      hidden = false;
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(document.title).toBe(base);
    } finally {
      delete (document as unknown as { hidden?: boolean }).hidden;
    }
  });

  it('/partner/orders/:id: chi tiết + dòng thời gian; PENDING KHÔNG có "Tải tệp"', async () => {
    signIn();
    renderApp(`/partner/orders/${ORDER_ID}`);
    expect(await screen.findByRole('button', { name: 'Nhận đơn' })).toBeInTheDocument();
    expect(screen.getByText('giao-trinh.pdf')).toBeInTheDocument();
    expect(screen.getByText('Dòng thời gian')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tải tệp' })).not.toBeInTheDocument();
  });

  it('/partner/orders/:id của tiệm khác/không tồn tại (BE 404) → "Không tìm thấy đơn", KHÔNG có nút Thử lại', async () => {
    signIn();
    renderApp('/partner/orders/650000000000000000000fff');
    expect(await screen.findByText('Không tìm thấy đơn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('audience — menu theo vai đăng nhập', () => {
  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => server.close());
  beforeEach(() => {
    o2oEnabled = true;
    useAuthStore.getState().clearAuth();
  });

  it('tài khoản CHỈ có partner:view (không dashboard:view) → menu chỉ có module partner', async () => {
    signIn(['partner:view', 'partner:update']);
    const { result } = renderHook(() => useAccessibleModules(), { wrapper });
    await waitFor(() => expect(result.current.map((m) => m.id)).toEqual(['partner']));
  });

  it('vận hành (manager) có o2o:view → thấy o2o, KHÔNG thấy partner', async () => {
    useAuthStore.getState().setAuth({
      user: {
        id: 'ops',
        email: 'o@x.vn',
        name: 'Ops',
        roles: ['manager'],
        permissions: ['o2o:view', 'dashboard:view'],
      },
      token: 't',
    });
    const { result } = renderHook(() => useAccessibleModules(), { wrapper });
    await waitFor(() => expect(result.current.map((m) => m.id)).toContain('o2o'));
    expect(result.current.map((m) => m.id)).not.toContain('partner');
  });
});
