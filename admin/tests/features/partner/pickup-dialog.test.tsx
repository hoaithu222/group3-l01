/**
 * Giao hàng bằng PIN (p6-05 admin.md §2.4/§4): PIN đúng 6 chữ số kiểm ở form; sai PIN hiện số lần còn lại (`attemptsLeft`) NGAY TRONG hộp
 * thoại (không toast); 423 `O2O_008` → đếm ngược và khoá nút xác nhận; 429 → cũng đếm ngược; `markPaid` mặc định tick và không gửi lại khi đơn đã thu.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import PickupDialog from '@/features/partner/components/PickupDialog';

import { errorBody, makeOrder, okBody, ORDER_ID, renderAt, signIn } from './partner-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn();
});

const readyOrder = () => makeOrder({ status: 'READY' });

function open(order = readyOrder()) {
  return renderAt(<PickupDialog order={order} onClose={() => undefined} />);
}

async function enterPin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  await user.type(await screen.findByLabelText(/Mã PIN/), pin);
}

describe('PickupDialog', () => {
  it('hiện khách + số tiền cần thu; ô "Đã thu tiền" mặc định TICK khi đơn chưa thu', async () => {
    open();
    expect(
      await screen.findByText(/Khách Nguyễn Sinh Viên · cần thu 43\.200 ₫/),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Đã thu tiền tại quầy/ })).toBeChecked();
  });

  it('PIN thiếu số → báo "Nhập đủ 6 chữ số", KHÔNG gọi BE', async () => {
    let posts = 0;
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, () => {
        posts += 1;
        return okBody(readyOrder());
      }),
    );
    open();
    const user = userEvent.setup();
    await enterPin(user, '123');
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    expect(await screen.findByText('Nhập đủ 6 chữ số')).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('đúng PIN → POST /pickup { pin, markPaid: true }', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, async ({ request }) => {
        bodies.push(await request.json());
        return okBody(makeOrder({ status: 'PICKED_UP' }));
      }),
    );
    open();
    const user = userEvent.setup();
    await enterPin(user, '123456');
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    await waitFor(() => expect(bodies).toEqual([{ pin: '123456', markPaid: true }]));
  });

  it('bỏ tick "Đã thu tiền" → markPaid: false', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, async ({ request }) => {
        bodies.push(await request.json());
        return okBody(makeOrder({ status: 'PICKED_UP' }));
      }),
    );
    open();
    const user = userEvent.setup();
    await enterPin(user, '654321');
    await user.click(screen.getByRole('checkbox', { name: /Đã thu tiền tại quầy/ }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    await waitFor(() => expect(bodies).toEqual([{ pin: '654321', markPaid: false }]));
  });

  it('đơn ĐÃ thu tiền: không có ô tick, gửi markPaid: false (không ghi đè người/thời điểm thu cũ)', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, async ({ request }) => {
        bodies.push(await request.json());
        return okBody(makeOrder({ status: 'PICKED_UP' }));
      }),
    );
    open(
      makeOrder({
        status: 'READY',
        payment: { method: 'AT_COUNTER', status: 'PAID', confirmedAt: '2026-09-20T03:00:00.000Z' },
      }),
    );
    expect(await screen.findByText('Đơn đã được ghi nhận thu tiền.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await enterPin(user, '111111');
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    await waitFor(() => expect(bodies).toEqual([{ pin: '111111', markPaid: false }]));
  });

  it('sai PIN (O2O_007) → "Còn N lần thử" trong hộp thoại, xoá ô PIN, giữ hộp thoại mở', async () => {
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, () =>
        errorBody(400, 'O2O_007', 'Mã PIN không đúng', { attemptsLeft: 3 }),
      ),
    );
    open();
    const user = userEvent.setup();
    await enterPin(user, '000000');
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    expect(await screen.findByText('Mã PIN không đúng')).toBeInTheDocument();
    expect(screen.getByText('Còn 3 lần thử trước khi bị khoá tạm thời.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Mã PIN/)).toHaveValue('');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('khoá (O2O_008, 423) → đếm ngược mm:ss, khoá ô PIN và nút xác nhận', async () => {
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, () =>
        errorBody(423, 'O2O_008', 'Nhập sai quá nhiều lần', { retryAfterSeconds: 900 }),
      ),
    );
    open();
    const user = userEvent.setup();
    await enterPin(user, '000000');
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    expect(await screen.findByText('Nhập sai quá nhiều lần')).toBeInTheDocument();
    expect(screen.getByText(/Thử lại sau 1[45]:\d\d\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận giao hàng' })).toBeDisabled();
    expect(screen.getByLabelText(/Mã PIN/)).toBeDisabled();
  });

  it('429 (chặn dò xuyên đơn) → cũng đếm ngược theo Retry-After', async () => {
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, () =>
        errorBody(429, 'RATE_001', 'Quá nhiều yêu cầu', undefined, { 'Retry-After': '90' }),
      ),
    );
    open();
    const user = userEvent.setup();
    await enterPin(user, '000000');
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    expect(await screen.findByText(/Thử lại sau 1:[23]\d\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận giao hàng' })).toBeDisabled();
  });

  it('đơn vừa đổi trạng thái (O2O_004) → banner gợi ý xem lại hàng đợi', async () => {
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, () =>
        errorBody(409, 'O2O_004', 'Không thể thực hiện', { status: 'CANCELLED' }),
      ),
    );
    open();
    const user = userEvent.setup();
    await enterPin(user, '123456');
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    expect(await screen.findByText('Không giao được đơn này')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận giao hàng' })).toBeEnabled();
  });

  it('đếm ngược chạy theo GIÂY THẬT và tự mở khoá khi hết giờ (banner biến mất, nút bấm được lại)', async () => {
    server.use(
      http.post(`*/partner/orders/${ORDER_ID}/pickup`, () =>
        errorBody(423, 'O2O_008', 'Nhập sai quá nhiều lần', { retryAfterSeconds: 2 }),
      ),
    );
    open();
    const user = userEvent.setup();
    await enterPin(user, '000000');
    await user.click(screen.getByRole('button', { name: 'Xác nhận giao hàng' }));
    expect(await screen.findByText(/Thử lại sau 0:0[12]\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận giao hàng' })).toBeDisabled();

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Xác nhận giao hàng' })).toBeEnabled(),
      { timeout: 5000 },
    );
    expect(screen.queryByText('Nhập sai quá nhiều lần')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Mã PIN/)).toBeEnabled();
  });
});
