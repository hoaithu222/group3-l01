/**
 * Tab "Tiệm in" (p6-05 admin.md §2.2/§4): bộ lọc trên URL; ngăn kéo: Duyệt cần `o2o:approve`, Tạm ngưng NÊU SỐ đơn chờ nhận bị ảnh hưởng và
 * gửi lý do; bảng giá chỉ đọc khi thiếu `o2o:update`, sửa gửi `expectedVersion` + lý do; tạo tiệm gắn lỗi `O2O_009` vào ô email.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import ShopsTab from '@/features/o2o/components/shops/ShopsTab';

import {
  makeLocation,
  makeOrder,
  makeShop,
  makeShopDetail,
  okBody,
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
});

function mockList(rows = [makeShop()]) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/print-shops', ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okBody(rows, pageMeta(rows.length));
    }),
  );
  return calls;
}

function mockDetail(detail = makeShopDetail()) {
  server.use(http.get(`*/admin/print-shops/${SHOP_ID}`, () => okBody(detail)));
}

const drawerUrl = `/o2o?tab=shops&shopId=${SHOP_ID}`;

describe('ShopsTab — danh sách', () => {
  it('cột: tên (liên kết), chủ tiệm + email, năng lực chỉ chip CÓ, trạng thái bằng chữ, đơn 30 ngày, nhận đơn Bật/Tắt', async () => {
    mockList([
      makeShop(),
      makeShop({
        id: '650000000000000000000b02',
        displayName: 'Photo Cổng Trường',
        status: 'PENDING',
        acceptingOrders: false,
        capabilities: { color: false, duplex: false, a3: false, binding: false },
        owner: { id: 'o2', name: 'Phạm Chủ' },
      }),
    ]);
    renderAt(<ShopsTab />, '/o2o?tab=shops');
    expect(await screen.findByRole('link', { name: 'In nhanh Bách Khoa' })).toBeInTheDocument();
    expect(screen.getByText('chu@tiem.vn')).toBeInTheDocument();
    expect(screen.getByText('In màu')).toBeInTheDocument();
    expect(screen.getByText('Chỉ A4 đen trắng, 1 mặt')).toBeInTheDocument();
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument();
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    expect(screen.getByText('Bật')).toBeInTheDocument();
    expect(screen.getByText('Tắt')).toBeInTheDocument();
  });

  it('q/status/trang trên URL đi vào request; chọn trạng thái về trang 1', async () => {
    const calls = mockList();
    const { router } = renderAt(<ShopsTab />, '/o2o?tab=shops&q=bach&status=PENDING&page=2');
    await screen.findByRole('link', { name: 'In nhanh Bách Khoa' });
    expect(calls[0]!.get('q')).toBe('bach');
    expect(calls[0]!.get('status')).toBe('PENDING');
    expect(calls[0]!.get('page')).toBe('2');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái duyệt' }));
    await user.click(await screen.findByRole('option', { name: 'Tạm ngưng' }));
    await waitFor(() => expect(urlParam(router, 'status')).toBe('SUSPENDED'));
    expect(urlParam(router, 'page')).toBeNull();
    expect(urlParam(router, 'tab')).toBe('shops');
  });
});

describe('ShopDrawer — duyệt / tạm ngưng', () => {
  it('thiếu o2o:approve → không có nút Duyệt; thiếu o2o:update → không có Tạm ngưng', async () => {
    mockList();
    mockDetail(makeShopDetail({ status: 'PENDING' }));
    renderAt(<ShopsTab />, drawerUrl);
    expect(await screen.findByText('Lê Chủ Tiệm')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt tiệm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạm ngưng' })).not.toBeInTheDocument();
  });

  it('có o2o:approve: Duyệt tiệm → lý do → POST /approve { reason }', async () => {
    signIn(['o2o:view', 'o2o:approve']);
    mockList();
    mockDetail(makeShopDetail({ status: 'PENDING' }));
    let posted: unknown = null;
    server.use(
      http.post(`*/admin/print-shops/${SHOP_ID}/approve`, async ({ request }) => {
        posted = await request.json();
        return okBody(makeShop({ status: 'APPROVED' }));
      }),
    );
    renderAt(<ShopsTab />, drawerUrl);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Duyệt tiệm' }));
    await user.type(screen.getByLabelText(/Lý do/), 'Đã kiểm tra giấy phép kinh doanh');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(posted).toEqual({ reason: 'Đã kiểm tra giấy phép kinh doanh' }));
  });

  it('Tạm ngưng NÊU SỐ đơn chờ nhận bị từ chối (BE pendingOrders) rồi POST /suspend { reason }', async () => {
    signIn(['o2o:view', 'o2o:update']);
    mockList();
    mockDetail(makeShopDetail({ pendingOrders: 3 }));
    let posted: unknown = null;
    server.use(
      http.post(`*/admin/print-shops/${SHOP_ID}/suspend`, async ({ request }) => {
        posted = await request.json();
        return okBody({ ...makeShop({ status: 'SUSPENDED' }), rejectedOrders: 3 });
      }),
    );
    renderAt(<ShopsTab />, drawerUrl);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạm ngưng' }));
    expect(
      await screen.findByText(/3 đơn đang chờ tiệm nhận sẽ tự bị từ chối/),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Lý do/), 'Nhiều khiếu nại về chất lượng in');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(posted).toEqual({ reason: 'Nhiều khiếu nại về chất lượng in' }));
  });

  it('tiệm đang tạm ngưng: hiện lý do và nút "Duyệt lại"', async () => {
    signIn(['o2o:view', 'o2o:approve']);
    mockList();
    mockDetail(makeShopDetail({ status: 'SUSPENDED', suspendedReason: 'Vi phạm quy chế' }));
    renderAt(<ShopsTab />, drawerUrl);
    expect(await screen.findByText('Vi phạm quy chế')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt lại' })).toBeInTheDocument();
  });
});

describe('ShopPriceForm — tab Bảng giá', () => {
  it('thiếu o2o:update: bảng giá CHỈ ĐỌC (không có form/nút Lưu)', async () => {
    mockList();
    mockDetail();
    renderAt(<ShopsTab />, drawerUrl);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Bảng giá' }));
    expect(await screen.findByText('A4 đen trắng (mỗi trang)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu bảng giá' })).not.toBeInTheDocument();
  });

  it('có o2o:update: thiếu lý do → báo lỗi, KHÔNG gọi BE; đủ lý do → PATCH kèm expectedVersion + priceTable + capabilities', async () => {
    signIn(['o2o:view', 'o2o:update']);
    mockList();
    mockDetail();
    const patches: unknown[] = [];
    server.use(
      http.patch(`*/admin/print-shops/${SHOP_ID}`, async ({ request }) => {
        patches.push(await request.json());
        return okBody(makeShop());
      }),
    );
    renderAt(<ShopsTab />, drawerUrl);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Bảng giá' }));
    await user.click(await screen.findByRole('button', { name: 'Lưu bảng giá' }));
    expect(await screen.findByText('Cần ghi lý do đổi bảng giá')).toBeInTheDocument();
    expect(patches).toEqual([]);

    await user.type(screen.getByLabelText(/Lý do đổi/), 'Giá giấy tăng theo nhà cung cấp');
    await user.click(screen.getByRole('button', { name: 'Lưu bảng giá' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      expectedVersion: 4,
      priceTable: {
        a4Bw: 500,
        a4Color: 2000,
        a3Bw: 1000,
        a3Color: 5000,
        duplexDiscountPct: 10,
        minOrder: 2000,
      },
      capabilities: { color: true, duplex: true, a3: false, binding: false },
      reason: 'Giá giấy tăng theo nhà cung cấp',
    });
  });

  it('409 RES_003 → banner "Dữ liệu đã thay đổi", giữ nguyên lý do đã gõ', async () => {
    signIn(['o2o:view', 'o2o:update']);
    mockList();
    mockDetail();
    server.use(
      http.patch(`*/admin/print-shops/${SHOP_ID}`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'RES_003', message: 'Xung đột' } },
          { status: 409 },
        ),
      ),
    );
    renderAt(<ShopsTab />, drawerUrl);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Bảng giá' }));
    await user.type(await screen.findByLabelText(/Lý do đổi/), 'Chỉnh giá A3 cho kỳ thi');
    await user.click(screen.getByRole('button', { name: 'Lưu bảng giá' }));
    expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeInTheDocument();
    expect(screen.getByLabelText(/Lý do đổi/)).toHaveValue('Chỉnh giá A3 cho kỳ thi');
  });
});

describe('ShopDrawer — tab Đơn gần đây', () => {
  it('liệt kê đơn của tiệm (lọc shopId, 10 đơn) với mã là liên kết sang tab Đơn in', async () => {
    let query: URLSearchParams | null = null;
    mockList();
    mockDetail();
    server.use(
      http.get('*/admin/print-orders', ({ request }) => {
        query = new URL(request.url).searchParams;
        return okBody([makeOrder()], pageMeta(1));
      }),
    );
    renderAt(<ShopsTab />, drawerUrl);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Đơn gần đây' }));
    const link = await screen.findByRole('link', { name: 'PO-7K2M9Q' });
    expect(link.getAttribute('href')).toContain('tab=orders');
    expect(query).not.toBeNull();
    expect((query as unknown as URLSearchParams).get('shopId')).toBe(SHOP_ID);
    expect((query as unknown as URLSearchParams).get('limit')).toBe('10');
  });
});

describe('ShopFormModal — tạo tiệm', () => {
  it('chỉ liệt kê địa điểm loại "Tiệm in" CHƯA có tiệm; O2O_009 (không tìm thấy chủ tiệm) gắn vào ô email', async () => {
    signIn(['o2o:view', 'o2o:create']);
    mockList();
    let query: URLSearchParams | null = null;
    server.use(
      http.get('*/admin/locations', ({ request }) => {
        query = new URL(request.url).searchParams;
        return okBody(
          [
            makeLocation({
              id: '650000000000000000000a11',
              name: 'Photo Tự Do',
              type: 'PRINT_SHOP',
              shop: null,
            }),
            makeLocation({
              id: '650000000000000000000a12',
              name: 'Photo Đã Có Tiệm',
              type: 'PRINT_SHOP',
              shop: { id: 'x', displayName: 'X', status: 'APPROVED' },
            }),
          ],
          pageMeta(2),
        );
      }),
      http.post('*/admin/print-shops', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'O2O_009',
              message: 'Không tìm thấy tài khoản chủ tiệm',
              details: { field: 'ownerEmail' },
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderAt(<ShopsTab />, '/o2o?tab=shops');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Thêm tiệm in' }));
    await screen.findByRole('dialog');
    expect((query as unknown as URLSearchParams).get('type')).toBe('PRINT_SHOP');

    await user.click(await screen.findByRole('combobox', { name: /Địa điểm/ }));
    expect(await screen.findByRole('option', { name: /Photo Tự Do/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Photo Đã Có Tiệm/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Photo Tự Do/ }));

    await user.type(screen.getByLabelText(/Email chủ tiệm/), 'khong-co@tiem.vn');
    await user.type(screen.getByLabelText(/Tên hiển thị/), 'Photo Tự Do');
    await user.click(screen.getByRole('button', { name: 'Tạo tiệm in' }));
    expect(await screen.findByText('Không tìm thấy tài khoản với email này')).toBeInTheDocument();
  });
});
