import { io } from 'socket.io-client';

import { setAccessToken } from '@/core/api/session';
import '@/core/socket';
import { SocketEvent } from '@/core/socket/socket.events';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * `socket.auth-sync.ts` — đồng bộ phiên REST↔socket.
 *
 * ⚠️ Nhập `@/core/socket` (barrel) chứ KHÔNG nhập thẳng `socket.client.ts` —
 * `socket.auth-sync.ts` chỉ được nạp qua side-effect `import` của barrel (xem
 * `core/socket/index.ts`), và test này cần đúng file đó đã đăng ký các listener.
 */
const mockedIo = io as jest.MockedFunction<typeof io>;
interface MockSocket {
  connect: jest.Mock;
  connected: boolean;
  disconnect: jest.Mock;
  emit: jest.Mock;
  on: jest.Mock;
  __reset: () => void;
}
const mockSocket = mockedIo.mock.results[0]?.value as MockSocket;

/** Đăng ký NGAY BÂY GIỜ — trước `jest.clearAllMocks()` xoá dấu vết của lượt `on()` lúc nạp module. */
const sessionExpiringHandler = mockSocket.on.mock.calls.find(
  ([event]) => event === SocketEvent.SESSION_EXPIRING,
)?.[1] as (() => void) | undefined;

function authRefreshCalls() {
  return mockSocket.emit.mock.calls.filter(([event]) => event === SocketEvent.AUTH_REFRESH);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket.__reset();
  useAuthStore.getState().clearAuth();
});

describe('session:expiring ⇒ auth:refresh', () => {
  it('có đăng ký đúng MỘT handler session:expiring lúc nạp module', () => {
    expect(sessionExpiringHandler).toBeDefined();
  });

  it('đẩy token HIỆN TẠI qua auth:refresh khi nhận session:expiring', () => {
    setAccessToken('access-hien-tai');

    sessionExpiringHandler?.();

    const calls = authRefreshCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ token: 'access-hien-tai' });
  });

  it('chưa có access token nào ⇒ KHÔNG gửi gì (không có gì để đẩy)', () => {
    sessionExpiringHandler?.();
    expect(authRefreshCalls()).toHaveLength(0);
  });

  it('ack RT_401 (refresh token cũng đã chết) ⇒ ngắt rồi nối lại', () => {
    setAccessToken('access-cu');
    mockSocket.connected = true;

    sessionExpiringHandler?.();

    const [, , ack] = mockSocket.emit.mock.calls.find(
      ([event]) => event === SocketEvent.AUTH_REFRESH,
    ) as [string, unknown, (result: { code?: string; ok: boolean }) => void];
    ack({ code: 'RT_401', ok: false });

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('ack ok:true ⇒ KHÔNG ngắt/nối lại gì cả', () => {
    setAccessToken('access-cu');

    sessionExpiringHandler?.();

    const [, , ack] = mockSocket.emit.mock.calls.find(
      ([event]) => event === SocketEvent.AUTH_REFRESH,
    ) as [string, unknown, (result: { code?: string; ok: boolean }) => void];
    ack({ ok: true });

    expect(mockSocket.disconnect).not.toHaveBeenCalled();
    expect(mockSocket.connect).not.toHaveBeenCalled();
  });
});
