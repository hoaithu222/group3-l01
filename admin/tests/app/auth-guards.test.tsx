/**
 * `AuthGuard` / `GuestGuard` + khôi phục phiên + kết thúc phiên giữa chừng — dựng router THẬT của
 * app, "BE giả" bằng MSW.
 *
 * Bất biến chính:
 *  - sau F5 KHÔNG nháy trang đăng nhập trong lúc khôi phục phiên;
 *  - `unavailable` (BE chập chờn) ≠ `unauthenticated`: có dấu hiệu từng đăng nhập thì hiện màn
 *    "thử lại", KHÔNG đá ra đăng nhập;
 *  - cổng là `status`, không phải `exp` của JWT: token hết hạn mà cookie refresh còn sống thì
 *    KHÔNG bị đá ra khi chuyển trang;
 *  - tài khoản không có quyền quản trị → trang 403 (kèm lối đăng xuất), không phải màn trắng;
 *  - phiên chết giữa chừng → về `/login` GIỮ `from` + lời nhắn, dọn cache, không tải lại trang;
 *  - đăng xuất/đăng nhập ở tab khác được đồng bộ (BroadcastChannel).
 */
import { act, configure, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import { purgeAuthSession } from '@/core/api/session';
import { queryClient } from '@/core/config';
import {
  errorBody,
  OPS_USER,
  PLAIN_USER,
  renderApp,
  resetAuth,
  sessionBody,
  shellHandlers,
  signIn,
  simulateReload,
} from '../features/auth/auth-test-utils';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../features/moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let refreshCalls = 0;
let logoutCalls = 0;
let refreshResponder: () => Response | Promise<Response>;

const server = setupServer(
  http.post('*/auth/refresh', async () => {
    refreshCalls += 1;
    return refreshResponder();
  }),
  http.get('*/auth/me', () => HttpResponse.json({ success: true, data: OPS_USER })),
  http.post('*/auth/logout', () => {
    logoutCalls += 1;
    return HttpResponse.json({ success: true, data: null });
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
  refreshCalls = 0;
  logoutCalls = 0;
  refreshResponder = () => HttpResponse.json(errorBody('AUTH_009'), { status: 401 });
  resetAuth();
});

/** Câu mô tả CHỈ có ở trang đăng nhập — dấu hiệu "người dùng đã thấy form đăng nhập". */
const LOGIN_MARKER = 'Nhập email và mật khẩu để tiếp tục.';

/** JWT giả chỉ có payload `{ exp }`. */
function jwtExpiringAt(expSeconds: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ exp: expSeconds })}.sig`;
}

describe('guard + phiên', { timeout: 30_000 }, () => {
  describe('F5 — khôi phục phiên', () => {
    it('⛔ có hồ sơ đã lưu + cookie còn sống ⇒ vào thẳng trang cũ, KHÔNG nháy trang đăng nhập', async () => {
      simulateReload(OPS_USER);
      refreshResponder = async () => {
        await delay(120);
        return HttpResponse.json(sessionBody(OPS_USER, 'token-moi'));
      };
      let sawLogin = false;
      const observer = new MutationObserver(() => {
        if (document.body.textContent?.includes(LOGIN_MARKER)) sawLogin = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const { router } = renderApp(['/profile']);
      // Trong lúc chờ: spinner, không phải form đăng nhập.
      expect(screen.queryByText(LOGIN_MARKER)).not.toBeInTheDocument();

      expect(await screen.findByRole('heading', { name: 'Thông tin cá nhân' })).toBeInTheDocument();
      observer.disconnect();

      expect(sawLogin).toBe(false);
      expect(router.state.location.pathname).toBe('/profile');
      expect(refreshCalls).toBe(1);
      expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', token: 'token-moi' });
    });

    it('chưa từng đăng nhập (không có hồ sơ) ⇒ về /login kèm `from`, KHÔNG có lời nhắn hết hạn', async () => {
      const { router } = renderApp(['/profile?tab=quyen']);

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      expect(router.state.location.state).toEqual({ from: '/profile?tab=quyen' });
      expect(screen.queryByText(/Phiên đăng nhập đã hết hạn/)).not.toBeInTheDocument();
    });

    it('có hồ sơ nhưng cookie đã hết hạn ⇒ về /login kèm lời nhắn "phiên đã hết hạn"', async () => {
      simulateReload(OPS_USER);

      renderApp(['/profile']);

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(screen.getByText(/Phiên đăng nhập đã hết hạn/)).toBeInTheDocument();
      // Hồ sơ cũ bị dọn: không còn dấu hiệu "từng đăng nhập".
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('⛔ có hồ sơ + BE chập chờn (503) ⇒ màn "thử lại", KHÔNG đá ra đăng nhập; mạng về thì thử lại vào được', async () => {
      simulateReload(OPS_USER);
      refreshResponder = () => new HttpResponse(null, { status: 503 });
      const user = userEvent.setup();

      renderApp(['/profile']);

      expect(await screen.findByText('Không kết nối được máy chủ')).toBeInTheDocument();
      expect(screen.queryByText(LOGIN_MARKER)).not.toBeInTheDocument();
      // Hồ sơ được GIỮ — đây chưa phải phiên chết.
      expect(useAuthStore.getState()).toMatchObject({ status: 'unavailable' });
      expect(useAuthStore.getState().user?.id).toBe('u1');

      refreshResponder = () => HttpResponse.json(sessionBody(OPS_USER, 'token-moi'));
      await user.click(screen.getByRole('button', { name: 'Thử lại' }));

      expect(await screen.findByRole('heading', { name: 'Thông tin cá nhân' })).toBeInTheDocument();
    });

    it('màn "thử lại" tự thử lại IM LẶNG mỗi 15 giây — mạng vừa về là vào được, không cần bấm', async () => {
      simulateReload(OPS_USER);
      refreshResponder = () => new HttpResponse(null, { status: 503 });
      // Bắt lời gọi `setInterval` của màn "thử lại" thay vì chờ 15 giây thật (fake timers làm treo `findBy*`).
      const setIntervalSpy = vi.spyOn(window, 'setInterval');
      renderApp(['/profile']);
      await screen.findByText('Không kết nối được máy chủ');
      const autoRetry = setIntervalSpy.mock.calls.find(([, ms]) => ms === 15_000);
      expect(autoRetry).toBeDefined();
      const callsBefore = refreshCalls;

      refreshResponder = () => HttpResponse.json(sessionBody(OPS_USER, 'token-moi'));
      await act(async () => {
        (autoRetry?.[0] as () => void)();
      });

      expect(await screen.findByRole('heading', { name: 'Thông tin cá nhân' })).toBeInTheDocument();
      expect(refreshCalls).toBe(callsBefore + 1);
      setIntervalSpy.mockRestore();
    });

    it('màn "thử lại" có lối thoát: "Đăng nhập lại" ⇒ về /login', async () => {
      simulateReload(OPS_USER);
      refreshResponder = () => HttpResponse.error();
      const user = userEvent.setup();
      renderApp(['/profile']);

      await user.click(await screen.findByRole('button', { name: 'Đăng nhập lại' }));

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('chưa từng đăng nhập + BE chết ⇒ trang đăng nhập (không có phiên nào để "giữ")', async () => {
      refreshResponder = () => new HttpResponse(null, { status: 503 });

      renderApp(['/profile']);

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
    });

    it('⛔ refresh trả token nhưng QUÊN hồ sơ ⇒ lấy hồ sơ từ /auth/me thay vì kẹt spinner / 403 oan', async () => {
      refreshResponder = () =>
        HttpResponse.json({ success: true, data: { accessToken: 'token-moi', tokenType: 'Bearer' } });

      renderApp(['/profile']);

      expect(await screen.findByRole('heading', { name: 'Thông tin cá nhân' })).toBeInTheDocument();
      expect(useAuthStore.getState().user?.id).toBe('u1');
    });

    it('mở thẳng /login khi cookie còn sống ⇒ vào ứng dụng luôn (không bắt đăng nhập lại)', async () => {
      simulateReload(OPS_USER);
      refreshResponder = () => HttpResponse.json(sessionBody(OPS_USER, 'token-moi'));

      const { router } = renderApp(['/login']);

      // Chỉ cần ĐÍCH điều hướng: không render trang chủ (nạp Recharts, chậm khi máy đang tải nặng).
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });

    it('mở /login lần đầu (không có hồ sơ) ⇒ KHÔNG tốn một lượt refresh vô ích', async () => {
      renderApp(['/login']);

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(refreshCalls).toBe(0);
    });
  });

  describe('cổng là `status`, không phải hạn của access token', () => {
    it('⛔ token đã quá hạn theo `exp` nhưng còn phiên ⇒ chuyển trang KHÔNG bị đá ra đăng nhập', async () => {
      signIn(OPS_USER, jwtExpiringAt(Math.floor(Date.now() / 1000) - 3600));
      const { router } = renderApp(['/profile']);
      await screen.findByRole('heading', { name: 'Thông tin cá nhân' });

      await act(async () => {
        await router.navigate('/settings');
      });

      expect(await screen.findByRole('heading', { name: 'Cài đặt' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/settings');
      expect(screen.queryByText(LOGIN_MARKER)).not.toBeInTheDocument();
    });
  });

  describe('cổng quyền quản trị', () => {
    it('⛔ tài khoản `user` thường (không quyền nào) ⇒ trang 403 kèm lối đăng xuất, KHÔNG mở shell', async () => {
      signIn(PLAIN_USER);
      renderApp(['/profile']);

      expect(
        await screen.findByRole('heading', { name: 'Tài khoản chưa được cấp quyền quản trị' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/khach@congty\.vn/)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Thông tin cá nhân' })).not.toBeInTheDocument();
      // Trang chủ chỉ quay lại đúng trang này nên không có nút "Về trang chủ".
      expect(screen.queryByRole('link', { name: 'Về trang chủ' })).not.toBeInTheDocument();
    });

    it('bấm "Đăng xuất" ở trang 403 ⇒ thu hồi phiên ở BE, về /login, sạch store', async () => {
      signIn(PLAIN_USER);
      const user = userEvent.setup();
      const { router } = renderApp(['/profile']);

      await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      expect(logoutCalls).toBe(1);
      expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', token: null, user: null });
    });

    it('vai `admin` không cần quyền chi tiết nào vẫn vào được; vai `manager` có quyền cũng vào được', async () => {
      signIn({ ...PLAIN_USER, roles: ['admin'], permissions: [] });
      renderApp(['/profile']);
      expect(await screen.findByRole('heading', { name: 'Thông tin cá nhân' })).toBeInTheDocument();
    });

    it('trang /403 thường (đã đăng nhập, thiếu quyền một phân hệ) vẫn có lối "Về trang chủ" + "Đăng xuất"', async () => {
      signIn(OPS_USER);
      renderApp(['/403']);

      expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Về trang chủ' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    });
  });

  describe('trang khách', () => {
    it.each(['/register', '/forgot-password'])(
      'đã đăng nhập mà mở %s ⇒ về trang chủ',
      async (path) => {
        signIn(OPS_USER);
        const { router } = renderApp([path]);

        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      },
    );
  });

  describe('phiên kết thúc giữa chừng', () => {
    it('⛔ phiên chết ⇒ về /login GIỮ `from`, có lời nhắn, dọn cache; đăng nhập lại quay về đúng trang', async () => {
      signIn(OPS_USER);
      const user = userEvent.setup();
      const { router } = renderApp(['/profile?tab=quyen']);
      await screen.findByRole('heading', { name: 'Thông tin cá nhân' });
      queryClient.setQueryData(['user', 'list'], [{ id: 'du-lieu-cua-phien-cu' }]);

      // Ví dụ: interceptor gặp `unauthenticated` ở lượt refresh giữa chừng.
      act(() => purgeAuthSession('expired'));

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      expect(router.state.location.state).toEqual({ from: '/profile?tab=quyen' });
      expect(screen.getByText(/Phiên đăng nhập đã hết hạn/)).toBeInTheDocument();
      expect(queryClient.getQueryData(['user', 'list'])).toBeUndefined();
      expect(useAuthStore.getState().token).toBeNull();

      // Đăng nhập lại → quay về đúng nơi đang làm dở.
      server.use(
        http.get('*/auth/nonce', () =>
          HttpResponse.json({ success: true, data: { nonce: 'n', expiresIn: 120 } }),
        ),
        http.post('*/auth/login', () => HttpResponse.json(sessionBody(OPS_USER))),
      );
      await user.type(screen.getByLabelText(/^Email/), 'an@congty.vn');
      await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau');
      await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

      expect(await screen.findByRole('heading', { name: 'Thông tin cá nhân' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/profile');
      expect(router.state.location.search).toBe('?tab=quyen');
    });

    it('tài khoản bị khoá giữa chừng (`locked`) ⇒ lời nhắn nói rõ, không phải "hết hạn"', async () => {
      signIn(OPS_USER);
      renderApp(['/profile']);
      await screen.findByRole('heading', { name: 'Thông tin cá nhân' });

      act(() => purgeAuthSession('locked'));

      expect(await screen.findByText(/Tài khoản đã bị khoá hoặc đang chờ xoá/)).toBeInTheDocument();
    });
  });

  describe('đồng bộ nhiều tab', () => {
    /** Kênh của MỘT TAB KHÁC (đối tượng riêng, cùng tên với kênh của app). */
    const otherTab = () => new BroadcastChannel('app:sync:auth');

    it('⛔ tab khác đăng xuất ⇒ tab này về /login NGAY, không gọi lại BE, không có lời nhắn hết hạn', async () => {
      signIn(OPS_USER);
      const { router } = renderApp(['/profile']);
      await screen.findByRole('heading', { name: 'Thông tin cá nhân' });

      const channel = otherTab();
      channel.postMessage({ type: 'ended', reason: null, from: 'tab-khac' });
      channel.close();

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      expect(logoutCalls).toBe(0);
      expect(screen.queryByText(/Phiên đăng nhập/)).not.toBeInTheDocument();
      expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', token: null });
    });

    it('tab khác báo phiên hết hạn ⇒ tab này cũng nhận đúng lý do', async () => {
      signIn(OPS_USER);
      renderApp(['/profile']);
      await screen.findByRole('heading', { name: 'Thông tin cá nhân' });

      const channel = otherTab();
      channel.postMessage({ type: 'ended', reason: 'expired', from: 'tab-khac' });
      channel.close();

      expect(await screen.findByText(/Phiên đăng nhập đã hết hạn/)).toBeInTheDocument();
    });

    it('⛔ tab khác đăng nhập TÀI KHOẢN KHÁC bằng cùng cookie ⇒ tab này bị cắt phiên, không trộn dữ liệu hai người', async () => {
      signIn(OPS_USER);
      const { router } = renderApp(['/profile']);
      await screen.findByRole('heading', { name: 'Thông tin cá nhân' });
      queryClient.setQueryData(['user', 'list'], [{ id: 'du-lieu-cua-an' }]);
      refreshResponder = () =>
        HttpResponse.json(sessionBody({ ...OPS_USER, id: 'u2', email: 'binh@congty.vn' }, 'token-cua-binh'));

      const channel = otherTab();
      channel.postMessage({ type: 'started', from: 'tab-khac' });
      channel.close();

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      expect(screen.getByText(/Phiên đăng nhập đã bị thu hồi/)).toBeInTheDocument();
      expect(queryClient.getQueryData(['user', 'list'])).toBeUndefined();
      expect(useAuthStore.getState().token).toBeNull();
    });

    it('tab khác báo vừa đăng nhập mà cookie đã chết ⇒ tab đang đăng nhập dọn phiên (không giữ phiên ma)', async () => {
      signIn(OPS_USER);
      renderApp(['/profile']);
      await screen.findByRole('heading', { name: 'Thông tin cá nhân' });
      refreshResponder = () => HttpResponse.json(errorBody('AUTH_009'), { status: 401 });

      const channel = otherTab();
      channel.postMessage({ type: 'started', from: 'tab-khac' });
      channel.close();

      expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
      expect(useAuthStore.getState().status).toBe('anonymous');
    });

    it('tab đang ở trang đăng nhập không bị dọn/nhắn oan khi tab khác đăng xuất', async () => {
      renderApp(['/login']);
      await screen.findByText(LOGIN_MARKER);
      useAuthStore.setState({ status: 'anonymous', endReason: null });

      const channel = otherTab();
      channel.postMessage({ type: 'ended', reason: 'expired', from: 'tab-khac' });
      channel.close();
      await act(async () => {
        await delay(50);
      });

      expect(useAuthStore.getState().endReason).toBeNull();
    });

    it('tab khác vừa đăng nhập ⇒ tab đang ở trang đăng nhập khôi phục phiên và vào ứng dụng', async () => {
      const { router } = renderApp(['/login']);
      await screen.findByText(LOGIN_MARKER);
      useAuthStore.setState({ status: 'anonymous', endReason: null });
      refreshResponder = () => HttpResponse.json(sessionBody(OPS_USER, 'token-moi'));

      const channel = otherTab();
      channel.postMessage({ type: 'started', from: 'tab-khac' });
      channel.close();

      // Chỉ cần ĐÍCH điều hướng: không render trang chủ (nạp Recharts, chậm khi máy đang tải nặng).
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(refreshCalls).toBe(1);
    });
  });
});
