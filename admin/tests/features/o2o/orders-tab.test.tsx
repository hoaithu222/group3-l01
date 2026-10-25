/**
 * Tab "Đơn in" (p6-05 admin.md §2.3/§4): bộ lọc trên URL đi vào request (mã đơn khớp CHÍNH XÁC, ngày TẠO); ngăn kéo chi tiết KHÔNG có PIN và
 * KHÔNG có nút tải tệp (viewpoint riêng tư); huỷ đơn cần `o2o:update` + BE cho phép (`adminActions.canCancel`), gửi lý do; timeline gọi đúng tên "Khách".
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import OrdersTab from '@/features/o2o/components/orders/OrdersTab';

import {
  makeOrder,
  makeShop,
  okBody,
  ORDER_ID,
  pageMeta,
  renderAt,
  SHOP_ID,
  signIn,
  urlParam,
} from './o2o-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['o2o:view']);
  server.use(http.get('*/admin/print-shops', () => okBody([makeShop()], pageMeta(1))));
});

function mockList(rows = [makeOrder()]) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/print-orders', ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okBody(rows, pageMeta(rows.length));
    }),
  );
  return calls;
}

function mockDetail(order = makeOrder()) {
  server.use(http.get(`*/admin/print-orders/${ORDER_ID}`, () => okBody(order)));
}

const drawerUrl = `/o2o?tab=orders&orderId=${ORDER_ID}`;

describe('OrdersTab — danh sách và bộ lọc', () => {
  it('cột: mã (liên kết), khách (tên), tiệm, trang × bản, tổng, trạng thái + thanh toán bằng chữ, gửi lúc', async () => {
    mockList([
      makeOrder(),
      makeOrder({
        id: '650000000000000000000c02',
        code: 'PO-AAAAAA',
        status: 'READY',
        payment: { method: 'AT_COUNTER', status: 'PAID', confirmedAt: null },
        pages: null,
        quote: null,
        readyAt: '2026-09-21T02:00:00.000Z',
      }),
    ]);
    renderAt(<OrdersTab />, '/o2o?tab=orders');
    expect(await screen.findByRole('link', { name: 'PO-7K2M9Q' })).toBeInTheDocument();
    expect(screen.getAllByText('Nguyễn Sinh Viên')).toHaveLength(2);
    expect(screen.getByText('12 trang × 2 bản')).toBeInTheDocument();
    expect(screen.getByText('Chờ tiệm nhận')).toBeInTheDocument();
    expect(screen.getByText('Sẵn sàng nhận')).toBeInTheDocument();
    expect(screen.getByText('Chưa thu tiền')).toBeInTheDocument();
    expect(screen.getByText('Đã thu tiền')).toBeInTheDocument();
    // Không có cột PIN/tệp.
    expect(screen.queryByRole('columnheader', { name: /PIN|Tệp/ })).not.toBeInTheDocument();
  });

  it('q/shop/status/paymentStatus/ngày/trang trên URL đi vào request; "Xoá bộ lọc" bỏ hết, giữ tab', async () => {
    const calls = mockList();
    const { router } = renderAt(
      <OrdersTab />,
      `/o2o?tab=orders&q=PO-7K2M9Q&shop=${SHOP_ID}&status=PENDING&paymentStatus=UNPAID&from=2026-09-01&to=2026-09-20&page=2`,
    );
    await screen.findByRole('link', { name: 'PO-7K2M9Q' });
    const q = calls[0]!;
    expect(q.get('q')).toBe('PO-7K2M9Q');
    expect(q.get('shopId')).toBe(SHOP_ID);
    expect(q.get('status')).toBe('PENDING');
    expect(q.get('paymentStatus')).toBe('UNPAID');
    expect(q.get('from')).toMatch(/^2026-0[89]-\d\dT/);
    expect(q.get('to')).toMatch(/^2026-09-\d\dT/);
    expect(q.get('page')).toBe('2');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await waitFor(() => expect(urlParam(router, 'status')).toBeNull());
    expect(urlParam(router, 'shop')).toBeNull();
    expect(urlParam(router, 'from')).toBeNull();
    expect(urlParam(router, 'tab')).toBe('orders');
    await waitFor(() => expect(calls.at(-1)!.get('shopId')).toBeNull());
  });

  it('giá trị URL lạ (trạng thái, id tiệm) bị bỏ, không gửi BE', async () => {
    const calls = mockList();
    renderAt(<OrdersTab />, '/o2o?tab=orders&status=EVIL&paymentStatus=x&shop=không-phải-id');
    await screen.findByRole('link', { name: 'PO-7K2M9Q' });
    expect(calls[0]!.get('status')).toBeNull();
    expect(calls[0]!.get('paymentStatus')).toBeNull();
    expect(calls[0]!.get('shopId')).toBeNull();
  });
});

describe('OrderDrawer — riêng tư và huỷ đơn', () => {
  it('chi tiết KHÔNG có PIN, KHÔNG có nút tải tệp; có báo giá snapshot và timeline gọi đúng "Khách"', async () => {
    mockList();
    mockDetail(makeOrder({ status: 'READY', readyAt: '2026-09-21T02:00:00.000Z' }));
    renderAt(<OrdersTab />, drawerUrl);
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(
        'Trang quản trị không hiển thị mã PIN nhận hàng và không cho tải tệp in của khách.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('giao-trinh.pdf')).toBeInTheDocument();
    expect(within(dialog).getByText('A4 · In màu · 2 mặt · 2 bản')).toBeInTheDocument();
    expect(within(dialog).getByText('43.200 ₫')).toBeInTheDocument();
    // Timeline: người thao tác trùng chủ đơn được gọi là "Khách" (không lộ id).
    expect(within(dialog).getAllByText(/· Khách$/).length).toBeGreaterThan(0);

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/\b\d{6}\b(?!\s*₫)/); // không có dãy 6 chữ số kiểu PIN
    expect(
      screen.queryByRole('button', { name: /tải tệp|tải xuống|PIN/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tải tệp|tải xuống/i })).not.toBeInTheDocument();
  });

  it('thiếu o2o:update → không có nút Huỷ đơn', async () => {
    mockList();
    mockDetail();
    renderAt(<OrdersTab />, drawerUrl);
    await screen.findByText('giao-trinh.pdf');
    expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).not.toBeInTheDocument();
  });

  it('có o2o:update nhưng BE báo không huỷ được (đã kết thúc) → không có nút Huỷ đơn', async () => {
    signIn(['o2o:view', 'o2o:update']);
    mockList();
    mockDetail(makeOrder({ status: 'PICKED_UP', adminActions: { canCancel: false } }));
    renderAt(<OrdersTab />, drawerUrl);
    await screen.findByText('giao-trinh.pdf');
    expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).not.toBeInTheDocument();
  });

  it('Huỷ đơn → nêu khách + chủ tiệm được báo → lý do → POST /cancel { reason }', async () => {
    signIn(['o2o:view', 'o2o:update']);
    mockList();
    mockDetail();
    let posted: unknown = null;
    server.use(
      http.post(`*/admin/print-orders/${ORDER_ID}/cancel`, async ({ request }) => {
        posted = await request.json();
        return okBody(makeOrder({ status: 'CANCELLED', adminActions: { canCancel: false } }));
      }),
    );
    renderAt(<OrdersTab />, drawerUrl);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Huỷ đơn' }));
    expect(await screen.findByText(/khách và chủ tiệm đều nhận thông báo/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Lý do/), 'Khách khiếu nại tiệm in sai khổ giấy');
    const dialog = await screen.findByRole('dialog', { name: /Huỷ đơn in/i });
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ đơn' }));
    await waitFor(() => expect(posted).toEqual({ reason: 'Khách khiếu nại tiệm in sai khổ giấy' }));
  });

  it('404 hiện "Không tìm thấy đơn in"', async () => {
    mockList();
    server.use(
      http.get(
        `*/admin/print-orders/${ORDER_ID}`,
        () =>
          new Response(
            JSON.stringify({ success: false, error: { code: 'RES_001', message: 'x' } }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
      ),
    );
    renderAt(<OrdersTab />, drawerUrl);
    expect(await screen.findByText('Không tìm thấy đơn in')).toBeInTheDocument();
  });
});
