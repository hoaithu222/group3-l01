/**
 * Đăng xuất từ menu người dùng ở Header — đi qua router THẬT + MSW.
 *
 * Bất biến:
 *  - gọi `POST /auth/logout` (mang Bearer) để BE thu hồi phiên + xoá cookie;
 *  - dọn store, React Query cache, ngắt socket, báo các tab khác, về `/login` KHÔNG kèm lời nhắn;
 *  - dù BE lỗi/mất mạng vẫn thoát khỏi trình duyệt này — và nói rõ phiên máy chủ chưa được thu hồi;
 *  - access token đã hết hạn ⇒ vẫn thu hồi được phiên (làm mới token rồi mới gửi logout).
 */
import { act, configure, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import { queryClient } from '@/core/config';
import { fakeSocket } from '../moderation/fake-socket';
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
  const { fakeSocket: shared } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => shared) };
});

const LOGIN_MARKER = 'Nhập email và mật khẩu để tiếp tục.';

let logoutAuthHeaders: string[] = [];
let logoutResponder: (n: number) => Response | Promise<Response>;
let refreshResponder: () => Response | Promise<Response>;

const server = setupServer(
  http.post('*/auth/logout', ({ request }) => {
    logoutAuthHeaders.push(request.headers.get('authorization') ?? '');
    return logoutResponder(logoutAuthHeaders.length);
  }),
  http.post('*/auth/refresh', () => refreshResponder()),
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
afterEach(() => {
  server.resetHandlers();
  fakeSocket.connected = false;
});

beforeEach(() => {
  logoutAuthHeaders = [];
  logoutResponder = () => HttpResponse.json({ success: true, data: null });
  refreshResponder = () => HttpResponse.json(sessionBody(OPS_USER, 'token-moi'));
  fakeSocket.disconnect.mockClear();
  // Socket đang nối — `disconnectSocket()` chỉ ngắt khi `socket.connected`.
  fakeSocket.connected = true;
  resetAuth();
});

async function openMenuAndLogout(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Thông tin cá nhân' });
  await user.click(screen.getByRole('button', { name: 'Menu người dùng' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Đăng xuất' }));
}

describe('đăng xuất', { timeout: 30_000 }, () => {
  it('⛔ thu hồi phiên ở BE (kèm Bearer), dọn store + cache, ngắt socket, về /login không kèm lời nhắn', async () => {
    signIn(OPS_USER, 'token-cu');
    queryClient.setQueryData(['user', 'list'], [{ id: 'du-lieu-cua-nguoi-dung' }]);
    const user = userEvent.setup();
    const { router } = renderApp(['/profile']);

    await openMenuAndLogout(user);

    expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(logoutAuthHeaders).toEqual(['Bearer token-cu']);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'anonymous',
      token: null,
      user: null,
      endReason: null,
    });
    expect(queryClient.getQueryData(['user', 'list'])).toBeUndefined();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
    // Tự thoát thì KHÔNG hiện "phiên đã hết hạn".
    expect(screen.queryByText(/Phiên đăng nhập/)).not.toBeInTheDocument();
  });

  it('báo các tab khác (`ended`, không lý do) để chúng cũng thoát', async () => {
    signIn(OPS_USER);
    const messages: unknown[] = [];
    const listener = new BroadcastChannel('app:sync:auth');
    listener.onmessage = (e: MessageEvent) => messages.push(e.data);
    const user = userEvent.setup();
    renderApp(['/profile']);

    await openMenuAndLogout(user);

    await waitFor(() =>
      expect(messages).toContainEqual(expect.objectContaining({ type: 'ended', reason: null })),
    );
    listener.close();
  });

  it('⛔ BE lỗi/mất mạng ⇒ vẫn thoát khỏi trình duyệt này, kèm cảnh báo phiên máy chủ chưa được thu hồi', async () => {
    signIn(OPS_USER);
    logoutResponder = () => HttpResponse.error();
    const user = userEvent.setup();
    renderApp(['/profile']);

    await openMenuAndLogout(user);

    expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', token: null });
    expect(await screen.findByText(/chưa thu hồi được phiên trên máy chủ/)).toBeInTheDocument();
  });

  it('BE trả 500 khi đăng xuất ⇒ vẫn thoát (không kẹt ở trang cũ)', async () => {
    signIn(OPS_USER);
    logoutResponder = () => HttpResponse.json(errorBody('SYS_500'), { status: 500 });
    const user = userEvent.setup();
    renderApp(['/profile']);

    await openMenuAndLogout(user);

    expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('access token đã hết hạn ⇒ làm mới token rồi mới gửi logout, để BE thu hồi được phiên thật', async () => {
    signIn(OPS_USER, 'token-cu');
    logoutResponder = (n) =>
      n === 1
        ? HttpResponse.json(errorBody('AUTH_002'), { status: 401 })
        : HttpResponse.json({ success: true, data: null });
    const user = userEvent.setup();
    renderApp(['/profile']);

    await openMenuAndLogout(user);

    expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
    // Lượt 1 bằng token cũ (401) → refresh → lượt 2 bằng token mới (200).
    expect(logoutAuthHeaders).toEqual(['Bearer token-cu', 'Bearer token-moi']);
    expect(screen.queryByText(/chưa thu hồi/)).not.toBeInTheDocument();
  });

  it('phiên đã chết sẵn (refresh 401) ⇒ thoát êm, không cảnh báo, không lời nhắn "hết hạn"', async () => {
    signIn(OPS_USER, 'token-cu');
    logoutResponder = () => HttpResponse.json(errorBody('AUTH_002'), { status: 401 });
    refreshResponder = () => HttpResponse.json(errorBody('AUTH_009'), { status: 401 });
    const user = userEvent.setup();
    renderApp(['/profile']);

    await openMenuAndLogout(user);

    expect(await screen.findByText(LOGIN_MARKER)).toBeInTheDocument();
    await act(async () => undefined);
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', endReason: null });
    expect(screen.queryByText(/chưa thu hồi/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phiên đăng nhập đã hết hạn/)).not.toBeInTheDocument();
  });
});
