/**
 * Quên / đặt lại mật khẩu (+ đăng ký) — router THẬT + MSW.
 *
 * Bất biến:
 *  - "Quên mật khẩu" báo THÀNH CÔNG kiểu chung chung (không tiết lộ email có tồn tại), và HIỆN lỗi
 *    (429, đứt mạng…) thay vì im lặng — form đã tắt toast nên bỏ trống là người dùng không thấy gì;
 *  - token đặt lại mật khẩu bị GỠ khỏi thanh địa chỉ ngay sau khi đọc (bí mật dùng một lần);
 *  - token sai/hết hạn (BE trả 401) hiện lỗi NGAY TRONG form — không bị coi là "phiên chết" rồi
 *    tải lại trang (lỗi cũ: 401 ở endpoint công khai kích nhánh refresh của interceptor).
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { errorBody, renderApp, resetAuth, sessionBody, OPS_USER } from './auth-test-utils';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let forgotBodies: Array<Record<string, unknown>> = [];
let forgotResponder: () => Response | Promise<Response>;
let resetBodies: Array<Record<string, unknown>> = [];
let resetResponder: () => Response | Promise<Response>;
let registerResponder: () => Response | Promise<Response>;
let registerCalls = 0;
let refreshCalls = 0;

const server = setupServer(
  http.get('*/auth/nonce', () =>
    HttpResponse.json({ success: true, data: { nonce: 'nonce-1', expiresIn: 120 } }),
  ),
  http.post('*/auth/forgot-password', async ({ request }) => {
    forgotBodies.push((await request.json()) as Record<string, unknown>);
    return forgotResponder();
  }),
  http.post('*/auth/reset-password', async ({ request }) => {
    resetBodies.push((await request.json()) as Record<string, unknown>);
    return resetResponder();
  }),
  http.post('*/auth/register', () => {
    registerCalls += 1;
    return registerResponder();
  }),
  http.post('*/auth/refresh', () => {
    refreshCalls += 1;
    return HttpResponse.json(errorBody('AUTH_009'), { status: 401 });
  }),
);

beforeAll(() => {
  configure({ asyncUtilTimeout: 8000 });
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
  server.close();
});
afterEach(() => server.resetHandlers());

beforeEach(() => {
  forgotBodies = [];
  resetBodies = [];
  registerCalls = 0;
  refreshCalls = 0;
  forgotResponder = () => HttpResponse.json({ success: true, data: null });
  resetResponder = () => HttpResponse.json({ success: true, data: null });
  registerResponder = () => HttpResponse.json(sessionBody(OPS_USER), { status: 201 });
  resetAuth();
});

const LOGIN_MARKER = 'Nhập email và mật khẩu để tiếp tục.';
const GENERIC_SUCCESS = /Nếu email tồn tại trong hệ thống/;

describe('quên mật khẩu', { timeout: 30_000 }, () => {
  it('⛔ báo thành công CHUNG CHUNG — cùng một câu cho mọi email, không xác nhận email có tồn tại', async () => {
    const user = userEvent.setup();
    renderApp(['/forgot-password']);

    await user.type(await screen.findByLabelText(/^Email/), 'nguoi-la@congty.vn');
    await user.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));

    const success = await screen.findByText(GENERIC_SUCCESS);
    expect(success).toBeInTheDocument();
    expect(success).not.toHaveTextContent(/đã tồn tại|không tồn tại|không có trong hệ thống/);
    expect(forgotBodies).toEqual([{ email: 'nguoi-la@congty.vn' }]);
  });

  it('email sai định dạng ⇒ báo lỗi, không gọi API', async () => {
    const user = userEvent.setup();
    renderApp(['/forgot-password']);

    await user.type(await screen.findByLabelText(/^Email/), 'khong-phai-email');
    await user.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));

    expect(await screen.findByText('Email không đúng định dạng')).toBeInTheDocument();
    expect(forgotBodies).toHaveLength(0);
  });

  it.each([
    ['bị giới hạn tốc độ (429)', () => HttpResponse.json(errorBody('RATE_001'), { status: 429, headers: { 'Retry-After': '120' } }), 'thử lại sau 2 phút'],
    ['đứt mạng', () => HttpResponse.error(), 'Không thể kết nối đến máy chủ'],
    ['BE lỗi 500', () => HttpResponse.json(errorBody('SYS_500'), { status: 500 }), 'Máy chủ đang gặp sự cố'],
  ])('⛔ %s ⇒ HIỆN lỗi (không im lặng) và KHÔNG hiện thông báo thành công', async (_l, responder, text) => {
    forgotResponder = responder;
    const user = userEvent.setup();
    renderApp(['/forgot-password']);

    await user.type(await screen.findByLabelText(/^Email/), 'an@congty.vn');
    await user.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByText(GENERIC_SUCCESS)).not.toBeInTheDocument();
  });

  it('Enter hai lần lúc lượt đầu còn bay ⇒ chỉ MỘT email được gửi', async () => {
    forgotResponder = async () => {
      await delay(150);
      return HttpResponse.json({ success: true, data: null });
    };
    const user = userEvent.setup();
    renderApp(['/forgot-password']);

    await user.type(await screen.findByLabelText(/^Email/), 'an@congty.vn');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    await screen.findByText(GENERIC_SUCCESS);
    expect(forgotBodies).toHaveLength(1);
  });
});

describe('đặt lại mật khẩu', { timeout: 30_000 }, () => {
  it('⛔ token bị GỠ khỏi thanh địa chỉ ngay sau khi đọc, nhưng form vẫn dùng được token đó', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(['/reset-password?token=ma-dat-lai-123']);

    const password = await screen.findByLabelText(/^Mật khẩu mới/);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.pathname).toBe('/reset-password');

    await user.type(password, 'Mat-khau-moi-1');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'Mat-khau-moi-1');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    // Gửi ĐÚNG token cũ + `newPassword`; `confirmPassword` không lên máy chủ.
    await waitFor(() => expect(resetBodies).toHaveLength(1));
    expect(resetBodies[0]).toEqual({ token: 'ma-dat-lai-123', newPassword: 'Mat-khau-moi-1' });
    // Thành công ⇒ về trang đăng nhập.
    expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('vào thẳng URL không có token ⇒ nói rõ liên kết không hợp lệ + lối gửi lại', async () => {
    renderApp(['/reset-password']);

    expect(await screen.findByRole('heading', { name: 'Liên kết không hợp lệ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gửi lại hướng dẫn' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('⛔ token sai/hết hạn (BE trả 401) ⇒ lỗi hiện NGAY TRONG form, KHÔNG refresh, KHÔNG bị đá đi', async () => {
    resetResponder = () =>
      HttpResponse.json(errorBody('AUTH_002', 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'), {
        status: 401,
      });
    const user = userEvent.setup();
    const { router } = renderApp(['/reset-password?token=het-han']);

    await user.type(await screen.findByLabelText(/^Mật khẩu mới/), 'Mat-khau-moi-1');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'Mat-khau-moi-1');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    expect(within(alert).getByRole('link', { name: 'Gửi lại hướng dẫn' })).toBeInTheDocument();
    expect(refreshCalls).toBe(0);
    expect(router.state.location.pathname).toBe('/reset-password');
  });

  it('mật khẩu quá ngắn / nhập lại không khớp ⇒ báo lỗi, không gọi API', async () => {
    const user = userEvent.setup();
    renderApp(['/reset-password?token=t']);

    await user.type(await screen.findByLabelText(/^Mật khẩu mới/), 'abc');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'abd');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByText('Mật khẩu tối thiểu 8 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument();
    expect(resetBodies).toHaveLength(0);
  });

  it('7 ký tự vẫn chưa đủ (BE đòi ≥ 8) ⇒ chặn ở form, không đợi BE trả 400', async () => {
    const user = userEvent.setup();
    renderApp(['/reset-password?token=t']);

    await user.type(await screen.findByLabelText(/^Mật khẩu mới/), 'abcdefg');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'abcdefg');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByText('Mật khẩu tối thiểu 8 ký tự')).toBeInTheDocument();
    expect(resetBodies).toHaveLength(0);
  });

  it('ô mật khẩu mới khai `new-password` để trình duyệt không điền mật khẩu CŨ vào đó', async () => {
    renderApp(['/reset-password?token=t']);

    expect(await screen.findByLabelText(/^Mật khẩu mới/)).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText(/^Nhập lại mật khẩu/)).toHaveAttribute('autocomplete', 'new-password');
  });
});

describe('đăng ký', { timeout: 30_000 }, () => {
  it('email đã có (409) ⇒ nói rõ bằng tiếng Việt, ở lại trang đăng ký', async () => {
    registerResponder = () =>
      HttpResponse.json(errorBody('RES_002', 'Email đã tồn tại'), { status: 409 });
    const user = userEvent.setup();
    const { router } = renderApp(['/register']);

    await user.type(await screen.findByLabelText(/^Họ tên/), 'Nguyễn Văn An');
    await user.type(screen.getByLabelText(/^Email/), 'an@congty.vn');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'matkhau1');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'matkhau1');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email này đã được đăng ký.');
    expect(router.state.location.pathname).toBe('/register');
  });

  it('mật khẩu dưới 8 ký tự (BE đòi ≥ 8) ⇒ chặn ở form, không gọi API', async () => {
    const user = userEvent.setup();
    renderApp(['/register']);

    await user.type(await screen.findByLabelText(/^Họ tên/), 'Nguyễn Văn An');
    await user.type(screen.getByLabelText(/^Email/), 'an@congty.vn');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'matkhau');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'matkhau');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByText('Mật khẩu tối thiểu 8 ký tự')).toBeInTheDocument();
    expect(registerCalls).toBe(0);
  });
});
