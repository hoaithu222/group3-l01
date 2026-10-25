/**
 * Trang đăng nhập — đi qua router THẬT (guard + layout + lazy-load), "BE giả" bằng MSW.
 *
 * Phủ: validate · ánh xạ lỗi BE sang tiếng Việt · KHÔNG lộ "email có tồn tại hay không" ·
 * chống gửi đúp (Enter hai lần) · loading · focus sau lỗi · điều hướng về `from` (chỉ đường dẫn
 * nội bộ) · lời nhắn "phiên đã hết hạn" · trợ năng (nhãn, aria-invalid, role=alert, autocomplete).
 */
import { configure, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import {
  errorBody,
  OPS_USER,
  renderApp,
  resetAuth,
  sessionBody,
  shellHandlers,
  signIn,
} from './auth-test-utils';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let loginBodies: Array<Record<string, unknown>> = [];
let loginResponder: () => Response | Promise<Response>;
let refreshCalls = 0;

const server = setupServer(
  http.get('*/auth/nonce', () =>
    HttpResponse.json({ success: true, data: { nonce: 'nonce-1', expiresIn: 120 } }),
  ),
  http.post('*/auth/login', async ({ request }) => {
    loginBodies.push((await request.json()) as Record<string, unknown>);
    return loginResponder();
  }),
  http.post('*/auth/refresh', () => {
    refreshCalls += 1;
    return HttpResponse.json(errorBody('AUTH_009'), { status: 401 });
  }),
  ...shellHandlers,
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
  loginBodies = [];
  refreshCalls = 0;
  loginResponder = () => HttpResponse.json(sessionBody(OPS_USER));
  resetAuth();
});

const emailField = () => screen.findByLabelText(/^Email/);
const passwordField = () => screen.findByLabelText(/^Mật khẩu/);
const submitButton = () => screen.findByRole('button', { name: 'Đăng nhập' });

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, password = 'mat-khau-dung') {
  await user.type(await emailField(), 'an@congty.vn');
  await user.type(await passwordField(), password);
  await user.click(await submitButton());
}

describe('trang đăng nhập', { timeout: 30_000 }, () => {
  describe('validate', () => {
    it('gửi form rỗng ⇒ báo lỗi từng ô, đưa con trỏ về ô lỗi đầu tiên, KHÔNG gọi API', async () => {
      const user = userEvent.setup();
      renderApp(['/login']);

      await user.click(await submitButton());

      expect(await screen.findByText('Email không được để trống')).toBeInTheDocument();
      expect(screen.getByText('Mật khẩu không được để trống')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText(/^Email/)).toHaveFocus());
      expect(loginBodies).toHaveLength(0);
    });

    it('email sai định dạng ⇒ báo lỗi, không gọi API', async () => {
      const user = userEvent.setup();
      renderApp(['/login']);

      await user.type(await emailField(), 'khong-phai-email');
      await user.type(await passwordField(), 'x');
      await user.click(await submitButton());

      expect(await screen.findByText('Email không đúng định dạng')).toBeInTheDocument();
      expect(loginBodies).toHaveLength(0);
    });

    it('⛔ KHÔNG áp độ dài tối thiểu cho mật khẩu ở form đăng nhập (mật khẩu 1 ký tự vẫn được gửi)', async () => {
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user, 'a');

      await waitFor(() => expect(loginBodies).toHaveLength(1));
      expect(loginBodies[0]).toMatchObject({ email: 'an@congty.vn', password: 'a', nonce: 'nonce-1' });
    });
  });

  describe('lỗi từ BE', () => {
    it('sai mật khẩu ⇒ báo lỗi bằng tiếng Việt, xoá + focus ô mật khẩu, giữ email, KHÔNG refresh', async () => {
      loginResponder = () =>
        HttpResponse.json(errorBody('AUTH_002', 'Email hoặc mật khẩu không đúng'), { status: 401 });
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user, 'sai-mat-khau');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Email hoặc mật khẩu không đúng.');
      expect(screen.getByLabelText(/^Mật khẩu/)).toHaveValue('');
      expect(screen.getByLabelText(/^Mật khẩu/)).toHaveFocus();
      expect(screen.getByLabelText(/^Email/)).toHaveValue('an@congty.vn');
      // Không bị tải lại/đá đi: vẫn ở trang đăng nhập, và không có lượt refresh nào.
      expect(refreshCalls).toBe(0);
      expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    });

    it('⛔ KHÔNG lộ "email có tồn tại hay không": dù BE nói gì, câu hiện ra vẫn y hệt', async () => {
      loginResponder = () =>
        HttpResponse.json(errorBody('AUTH_001', 'Email không tồn tại trong hệ thống'), {
          status: 401,
        });
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Email hoặc mật khẩu không đúng.');
      expect(alert).not.toHaveTextContent(/tồn tại/i);
    });

    it.each([
      ['AUTH_011', 403, 'Tài khoản đã bị khoá'],
      ['AUTH_012', 403, 'Tài khoản đang chờ xoá'],
    ])('%s ⇒ thông điệp tiếng Việt, không hiện mã lỗi thô', async (code, status, expected) => {
      loginResponder = () => HttpResponse.json(errorBody(code, 'raw'), { status });
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(expected);
      expect(alert).not.toHaveTextContent(code);
    });

    it('nonce bị từ chối liên tục (AUTH_018 hai lần) ⇒ câu thường, KHÔNG có từ "nonce"', async () => {
      loginResponder = () =>
        HttpResponse.json(errorBody('AUTH_018', 'Mã nonce không hợp lệ'), { status: 401 });
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Yêu cầu đã hết hạn. Vui lòng thử lại.');
      expect(alert).not.toHaveTextContent(/nonce/i);
      expect(loginBodies).toHaveLength(2); // lần đầu + đúng MỘT lần thử lại
    });

    it('bị giới hạn tốc độ (429 + Retry-After) ⇒ nói còn phải chờ bao lâu', async () => {
      loginResponder = () =>
        HttpResponse.json(errorBody('RATE_001', 'Quá nhiều lần thử đăng nhập'), {
          status: 429,
          headers: { 'Retry-After': '900' },
        });
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user);

      expect(await screen.findByRole('alert')).toHaveTextContent('thử lại sau 15 phút');
    });

    it('đứt mạng ⇒ nói "kiểm tra kết nối", KHÔNG nói sai thông tin', async () => {
      loginResponder = () => HttpResponse.error();
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Không thể kết nối đến máy chủ');
      expect(alert).not.toHaveTextContent('không đúng');
    });

    it('BE lỗi 500 ⇒ "máy chủ đang gặp sự cố"', async () => {
      loginResponder = () => HttpResponse.json(errorBody('SYS_500', 'boom'), { status: 500 });
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user);

      expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang gặp sự cố');
    });
  });

  describe('gửi form', () => {
    it('⛔ Enter hai lần liên tiếp lúc lượt đầu còn bay ⇒ chỉ MỘT lượt đăng nhập', async () => {
      loginResponder = async () => {
        await delay(150);
        return HttpResponse.json(sessionBody(OPS_USER));
      };
      const user = userEvent.setup();
      renderApp(['/login']);

      await user.type(await emailField(), 'an@congty.vn');
      await user.type(await passwordField(), 'mat-khau-dung');
      await user.keyboard('{Enter}');
      await user.keyboard('{Enter}');

      await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
      expect(loginBodies).toHaveLength(1);
    });

    it('đang gửi ⇒ nút khoá + aria-busy (loading), gửi xong thì vào trang chủ', async () => {
      loginResponder = async () => {
        await delay(150);
        return HttpResponse.json(sessionBody(OPS_USER));
      };
      const user = userEvent.setup();
      const { router } = renderApp(['/login']);

      await user.type(await emailField(), 'an@congty.vn');
      await user.type(await passwordField(), 'mat-khau-dung');
      await user.click(await submitButton());

      // Regex: khi đang tải, spinner (có aria-label) nằm trong nút nên tên nút dài ra.
      const busy = await screen.findByRole('button', { name: /Đăng nhập/ });
      expect(busy).toBeDisabled();
      expect(busy).toHaveAttribute('aria-busy', 'true');

      // Chỉ cần ĐÍCH điều hướng: không render trang chủ (nạp Recharts, chậm khi máy đang tải nặng).
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });
  });

  describe('điều hướng sau đăng nhập', () => {
    it('bị đá ra từ /profile?tab=x ⇒ đăng nhập xong quay lại ĐÚNG /profile?tab=x', async () => {
      const user = userEvent.setup();
      const { router } = renderApp(['/profile?tab=x']);

      // Chưa có phiên (F5 lần đầu) ⇒ khôi phục → 401 → /login kèm `from`.
      await fillAndSubmit(user);

      expect(await screen.findByRole('heading', { name: 'Thông tin cá nhân' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/profile');
      expect(router.state.location.search).toBe('?tab=x');
    });

    it.each(['https://evil.example/phish', '//evil.example/phish', 'javascript:alert(1)', '/login'])(
      '⛔ `from` = %s không phải đường dẫn nội bộ hợp lệ ⇒ về trang chủ, KHÔNG đi theo',
      async (from) => {
        const user = userEvent.setup();
        const { router } = renderApp([{ pathname: '/login', state: { from } }]);

        await fillAndSubmit(user);

        await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
        expect(router.state.location.search).toBe('');
      },
    );

    it('đã đăng nhập mà mở /login ⇒ về trang chủ, không thấy form đăng nhập', async () => {
      signIn(OPS_USER);
      const { router } = renderApp(['/login']);

      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(screen.queryByRole('button', { name: 'Đăng nhập' })).not.toBeInTheDocument();
    });
  });

  describe('phiên cũ kết thúc không phải do bấm đăng xuất', () => {
    it.each([
      ['expired', 'Phiên đăng nhập đã hết hạn'],
      ['revoked', 'Phiên đăng nhập đã bị thu hồi'],
      ['locked', 'Tài khoản đã bị khoá hoặc đang chờ xoá'],
    ] as const)('lý do `%s` ⇒ hiện lời nhắn tương ứng', async (reason, text) => {
      useAuthStore.setState({ status: 'anonymous', endReason: reason });
      renderApp(['/login']);

      expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    });

    it('tự đăng xuất (không lý do) ⇒ KHÔNG có lời nhắn nào', async () => {
      useAuthStore.setState({ status: 'anonymous', endReason: null });
      renderApp(['/login']);

      await submitButton();
      expect(screen.queryByText(/Phiên đăng nhập/)).not.toBeInTheDocument();
    });

    it('đăng nhập thành công xoá lời nhắn của phiên cũ', async () => {
      useAuthStore.setState({ status: 'anonymous', endReason: 'expired' });
      const user = userEvent.setup();
      renderApp(['/login']);

      await fillAndSubmit(user);

      await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
      expect(useAuthStore.getState().endReason).toBeNull();
    });
  });

  describe('trợ năng', () => {
    it('mỗi ô nhập có nhãn, đúng autocomplete cho trình quản lý mật khẩu', async () => {
      renderApp(['/login']);

      const email = await emailField();
      const password = await passwordField();
      expect(email).toHaveAttribute('autocomplete', 'email');
      expect(email).toHaveAttribute('type', 'email');
      expect(password).toHaveAttribute('autocomplete', 'current-password');
      expect(password).toHaveAttribute('type', 'password');
    });

    it('ô lỗi mang aria-invalid và trỏ aria-describedby tới câu lỗi; thông báo lỗi có role=alert', async () => {
      const user = userEvent.setup();
      renderApp(['/login']);

      await user.click(await submitButton());

      const email = await screen.findByLabelText(/^Email/);
      await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
      const describedBy = email.getAttribute('aria-describedby') ?? '';
      const message = document.getElementById(describedBy.split(' ')[0]);
      expect(message).toHaveTextContent('Email không được để trống');
      expect(message).toHaveAttribute('role', 'alert');
    });
  });
});
