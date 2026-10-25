/**
 * Hàng đợi của chủ tiệm (p6-05 admin.md §2.4/§4): bốn cột theo trạng thái (đơn chờ lâu nhất lên đầu), nút hành động vẽ theo `partnerActions` do
 * BE tính — "Tải tệp" KHÔNG có ở đơn PENDING; nhận / từ chối (lý do 3–200) / bắt đầu in / đã in xong gọi đúng endpoint; tải tệp mở URL ký ở tab mới;
 * rỗng → "Chưa có đơn mới"; lỗi tải có "Thử lại"; tiệm không nhận được đơn có banner.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import PartnerQueueTab from '@/features/partner/components/PartnerQueueTab';

import {
  cursorMeta,
  errorBody,
  makeOrder,
  makeShop,
  okBody,
  ORDER_ID,
  renderAt,
  signIn,
} from './partner-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn();
  server.use(http.get('*/partner/shops/me', () => okBody([makeShop()])));
});

function mockQueue(orders = [makeOrder()]) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/partner/orders', ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okBody(orders, cursorMeta());
    }),
  );
  return calls;
}

const column = (title: string) => screen.getByRole('region', { name: `Cột ${title}` });

describe('OrderQueueBoard', () => {
  it('gửi status bốn trạng thái đang xử lý (dấu phẩy) và chia đơn vào đúng cột; chờ lâu nhất lên đầu', async () => {
    const calls = mockQueue([
      makeOrder({
        id: '650000000000000000000c02',
        code: 'PO-NEWEST',
        submittedAt: '2026-09-20T05:00:00.000Z',
      }),
      makeOrder({
        id: '650000000000000000000c01',
        code: 'PO-OLDEST',
        submittedAt: '2026-09-20T01:00:00.000Z',
      }),
      makeOrder({ id: '650000000000000000000c03', code: 'PO-ACC', status: 'ACCEPTED' }),
      makeOrder({ id: '650000000000000000000c04', code: 'PO-PRN', status: 'PRINTING' }),
      makeOrder({ id: '650000000000000000000c05', code: 'PO-RDY', status: 'READY' }),
    ]);
    renderAt(<PartnerQueueTab />);
    await screen.findByRole('link', { name: 'PO-OLDEST' });
    expect(calls[0]!.get('status')).toBe('PENDING,ACCEPTED,PRINTING,READY');

    const pending = within(column('Mới'))
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(pending).toEqual(['PO-OLDEST', 'PO-NEWEST']);
    expect(within(column('Đã nhận')).getByRole('link', { name: 'PO-ACC' })).toBeInTheDocument();
    expect(within(column('Đang in')).getByRole('link', { name: 'PO-PRN' })).toBeInTheDocument();
    expect(within(column('Sẵn sàng')).getByRole('link', { name: 'PO-RDY' })).toBeInTheDocument();
  });

  it('thẻ đơn: mã là liên kết chi tiết, khách, trang × bản, cấu hình, tổng tiền, thanh toán; KHÔNG có PIN', async () => {
    mockQueue();
    renderAt(<PartnerQueueTab />);
    const link = await screen.findByRole('link', { name: 'PO-7K2M9Q' });
    expect(link).toHaveAttribute('href', `/partner/orders/${ORDER_ID}`);
    expect(screen.getByText('Nguyễn Sinh Viên')).toBeInTheDocument();
    expect(screen.getByText('12 trang × 2 bản')).toBeInTheDocument();
    expect(screen.getByText('A4 · In màu · 2 mặt · 2 bản')).toBeInTheDocument();
    expect(screen.getByText('43.200 ₫')).toBeInTheDocument();
    expect(screen.getByText('Chưa thu tiền')).toBeInTheDocument();
    expect(screen.getByText(/Đã chờ/)).toBeInTheDocument();
    // Chỉ MỘT tiệm → thẻ không ghi tên tiệm.
    expect(screen.queryByText(/In nhanh Bách Khoa/)).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/mã PIN/i);
  });

  it('PENDING: có Nhận đơn/Từ chối, KHÔNG có "Tải tệp" (tiệm không thấy tệp trước khi nhận)', async () => {
    mockQueue([makeOrder({ status: 'PENDING' })]);
    renderAt(<PartnerQueueTab />);
    await screen.findByRole('button', { name: 'Nhận đơn' });
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tải tệp' })).not.toBeInTheDocument();
  });

  it('nút theo trạng thái: ACCEPTED có Tải tệp + Bắt đầu in; PRINTING có Đã in xong; READY có Giao hàng', async () => {
    mockQueue([
      makeOrder({ id: '650000000000000000000c03', code: 'PO-ACC', status: 'ACCEPTED' }),
      makeOrder({ id: '650000000000000000000c04', code: 'PO-PRN', status: 'PRINTING' }),
      makeOrder({ id: '650000000000000000000c05', code: 'PO-RDY', status: 'READY' }),
    ]);
    renderAt(<PartnerQueueTab />);
    await screen.findByRole('link', { name: 'PO-ACC' });
    const accepted = within(column('Đã nhận'));
    expect(accepted.getByRole('button', { name: 'Tải tệp' })).toBeInTheDocument();
    expect(accepted.getByRole('button', { name: 'Bắt đầu in' })).toBeInTheDocument();
    const printing = within(column('Đang in'));
    expect(printing.getByRole('button', { name: 'Đã in xong' })).toBeInTheDocument();
    expect(printing.getByRole('button', { name: 'Tải tệp' })).toBeInTheDocument();
    const ready = within(column('Sẵn sàng'));
    expect(ready.getByRole('button', { name: 'Giao hàng' })).toBeInTheDocument();
    expect(ready.queryByRole('button', { name: 'Tải tệp' })).not.toBeInTheDocument();
  });

  it('rỗng → EmptyState "Chưa có đơn mới" (không vẽ bốn cột rỗng)', async () => {
    mockQueue([]);
    renderAt(<PartnerQueueTab />);
    expect(await screen.findByText('Chưa có đơn mới')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cột Mới' })).not.toBeInTheDocument();
  });

  it('lỗi tải → Callout + "Thử lại" (không nói "chưa có đơn"); bấm thử lại tải được', async () => {
    let fail = true;
    server.use(
      http.get('*/partner/orders', () =>
        fail ? errorBody(500, 'SYS_500', 'Lỗi') : okBody([makeOrder()], cursorMeta()),
      ),
    );
    renderAt(<PartnerQueueTab />);
    expect(await screen.findByText('Không tải được hàng đợi đơn in')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có đơn mới')).not.toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('link', { name: 'PO-7K2M9Q' })).toBeInTheDocument();
  });

  it('403 (vd quản trị viên mở nhầm cổng — BE không cấp partner:* cho vai hệ thống) → nói rõ không có quyền, KHÔNG mời "Thử lại"', async () => {
    server.use(http.get('*/partner/orders', () => errorBody(403, 'AUTH_003', 'Không có quyền')));
    renderAt(<PartnerQueueTab />);
    expect(await screen.findByText('Không có quyền xem dữ liệu này')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(screen.queryByText('Chưa có đơn mới')).not.toBeInTheDocument();
  });

  it('nhiều tiệm → thẻ ghi thêm tên tiệm', async () => {
    mockQueue();
    server.use(
      http.get('*/partner/shops/me', () =>
        okBody([
          makeShop(),
          makeShop({ id: '650000000000000000000b02', displayName: 'Photo Cổng Trường' }),
        ]),
      ),
    );
    renderAt(<PartnerQueueTab />);
    expect(await screen.findByText(/In nhanh Bách Khoa/)).toBeInTheDocument();
  });
});

describe('OrderActions — gọi đúng endpoint', () => {
  it('Nhận đơn → POST /accept', async () => {
    mockQueue([makeOrder({ status: 'PENDING' })]);
    let hit = 0;
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/accept`, () => {
        hit += 1;
        return okBody(makeOrder({ status: 'ACCEPTED' }));
      }),
    );
    renderAt(<PartnerQueueTab />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Nhận đơn' }));
    await waitFor(() => expect(hit).toBe(1));
  });

  it('Bắt đầu in → POST /printing; Đã in xong → POST /ready', async () => {
    mockQueue([
      makeOrder({ id: '650000000000000000000c03', code: 'PO-ACC', status: 'ACCEPTED' }),
      makeOrder({ id: '650000000000000000000c04', code: 'PO-PRN', status: 'PRINTING' }),
    ]);
    const hits: string[] = [];
    server.use(
      http.post('*/partner/orders/650000000000000000000c03/printing', () => {
        hits.push('printing');
        return okBody(makeOrder());
      }),
      http.post('*/partner/orders/650000000000000000000c04/ready', () => {
        hits.push('ready');
        return okBody(makeOrder());
      }),
    );
    renderAt(<PartnerQueueTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Bắt đầu in' }));
    await user.click(screen.getByRole('button', { name: 'Đã in xong' }));
    await waitFor(() => expect(hits.sort()).toEqual(['printing', 'ready']));
  });

  it('Từ chối: lý do quá ngắn (< 3) báo lỗi và KHÔNG gọi BE; đủ lý do → POST /reject { reason }', async () => {
    mockQueue([makeOrder({ status: 'PENDING' })]);
    const bodies: unknown[] = [];
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/reject`, async ({ request }) => {
        bodies.push(await request.json());
        return okBody(makeOrder({ status: 'REJECTED' }));
      }),
    );
    renderAt(<PartnerQueueTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Từ chối' }));
    await user.type(screen.getByLabelText(/Lý do/), 'ab');
    await user.click(screen.getByRole('button', { name: 'Từ chối đơn' }));
    expect(await screen.findByText('Lý do tối thiểu 3 ký tự')).toBeInTheDocument();
    expect(bodies).toEqual([]);

    await user.type(screen.getByLabelText(/Lý do/), 'c');
    await user.click(screen.getByRole('button', { name: 'Từ chối đơn' }));
    await waitFor(() => expect(bodies).toEqual([{ reason: 'abc' }]));
  });

  it('Tải tệp → GET /file rồi mở URL ký ở TAB MỚI (noopener)', async () => {
    mockQueue([makeOrder({ status: 'ACCEPTED' })]);
    server.use(
      http.get(`*/partner/orders/${ORDER_ID}/file`, () =>
        okBody({
          url: 'https://files.example/signed?token=abc',
          expiresAt: '2026-09-20T02:10:00.000Z',
          fileName: 'giao-trinh.pdf',
        }),
      ),
    );
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderAt(<PartnerQueueTab />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Tải tệp' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://files.example/signed?token=abc',
        '_blank',
        'noopener,noreferrer',
      ),
    );
  });

  it('O2O_004 khi nhận đơn (khách vừa huỷ) → báo lỗi bằng thông điệp mã lỗi và làm mới hàng đợi', async () => {
    const calls = mockQueue([makeOrder({ status: 'PENDING' })]);
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/accept`, () =>
        errorBody(409, 'O2O_004', 'Không thể thực hiện ở trạng thái đơn hiện tại', {
          status: 'CANCELLED',
        }),
      ),
    );
    renderAt(<PartnerQueueTab />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Nhận đơn' }));
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe('ShopStatusBanner', () => {
  it('tiệm ổn (đã duyệt + đang nhận) → không có banner', async () => {
    mockQueue();
    renderAt(<PartnerQueueTab />);
    await screen.findByRole('link', { name: 'PO-7K2M9Q' });
    expect(
      screen.queryByText(/đang tắt nhận đơn|đang tạm ngưng|đang chờ duyệt/),
    ).not.toBeInTheDocument();
  });

  it('tắt nhận đơn → banner nhắc bật lại; tạm ngưng → hiện lý do; chờ duyệt → nêu chờ duyệt', async () => {
    mockQueue();
    server.use(
      http.get('*/partner/shops/me', () =>
        okBody([
          makeShop({ acceptingOrders: false }),
          makeShop({
            id: '650000000000000000000b02',
            displayName: 'Tiệm B',
            status: 'SUSPENDED',
            suspendedReason: 'Nhiều khiếu nại',
          }),
          makeShop({ id: '650000000000000000000b03', displayName: 'Tiệm C', status: 'PENDING' }),
        ]),
      ),
    );
    renderAt(<PartnerQueueTab />);
    expect(
      await screen.findByText('Tiệm In nhanh Bách Khoa đang tắt nhận đơn'),
    ).toBeInTheDocument();
    expect(screen.getByText('Tiệm Tiệm B đang tạm ngưng')).toBeInTheDocument();
    expect(screen.getByText('Nhiều khiếu nại')).toBeInTheDocument();
    expect(screen.getByText('Tiệm Tiệm C đang chờ duyệt')).toBeInTheDocument();
  });
});
