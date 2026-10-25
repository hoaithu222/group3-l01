/**
 * `socket.auth-sync.ts` — đồng bộ phiên REST↔socket (p0-03):
 *  1. `connect_error` với `data.code` thuộc nhóm `AUTH_*`:
 *     - mã "access token bắt tay không dùng được" (`AUTH_002/003/004`) ⇒ cookie refresh có thể
 *       còn sống ⇒ `refreshSession()` RỒI nối lại; chỉ dọn phiên khi refresh nói phiên chết;
 *     - phán quyết cuối (`AUTH_011/012` khoá/chờ xoá, `AUTH_010` thu hồi…) ⇒ dọn phiên NGAY.
 *  2. `session:expiring` ⇒ `refreshSession()` rồi đẩy token mới qua `auth:refresh` — CHỈ khi
 *     refresh thành công.
 *  3. `disconnect` do máy chủ chủ động ngắt ⇒ nối lại (socket.io không tự nối).
 *
 * Bản cũ của bài này khoá hành vi "AUTH_003 ⇒ dọn phiên luôn, không thử refresh". Đó chính là lỗi:
 * laptop ngủ / tab nền quá 15 phút rồi socket tự nối lại bằng access token đã hết hạn ⇒ bị đá ra
 * đăng nhập dù cookie refresh còn 7 ngày. Xem `isRefreshableAuthCode`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAccessToken = vi.fn<() => string | null>();
const purgeAuthSession = vi.fn();
const refreshSession = vi.fn();

vi.mock('@/core/api/session', () => ({
  getAccessToken: (...args: unknown[]) => getAccessToken(...(args as [])),
  purgeAuthSession: (...args: unknown[]) => purgeAuthSession(...(args as [])),
  refreshSession: (...args: unknown[]) => refreshSession(...(args as [])),
}));

type Handler = (...args: unknown[]) => void;

function createFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  return {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn((_event: string, _payload: unknown, ack?: (a: { ok: boolean }) => void) => {
      ack?.({ ok: true });
    }),
    on: vi.fn((event: string, cb: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), cb]);
    }),
    off: vi.fn(),
    emitFromServer: (event: string, ...args: unknown[]) => {
      (handlers.get(event) ?? []).forEach((h) => h(...args));
    },
  };
}

const fakeSocket = createFakeSocket();

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

// Side-effect only — `socket.auth-sync.ts` không export gì, chỉ đăng ký handler
// lên `fakeSocket` lúc nạp module.
await import('@/core/socket/socket.auth-sync');
const { SocketEvent } = await import('@/core/socket/socket.events');

/** `await refreshSession().then(...)` đi qua ít nhất một lượt microtask trước khi `emit` được gọi. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const authError = (code: string) =>
  Object.assign(new Error(`lỗi ${code}`), { data: { code } });

beforeEach(() => {
  purgeAuthSession.mockClear();
  refreshSession.mockReset();
  getAccessToken.mockReset();
  getAccessToken.mockReturnValue('token-trong-bo-nho');
  fakeSocket.emit.mockClear();
  fakeSocket.connect.mockClear();
  // Một lần `connect` thành công hạ cờ "đã refresh mà vẫn bị từ chối" của ca trước.
  fakeSocket.emitFromServer('connect');
});

describe('connect_error — phán quyết cuối của máy chủ ⇒ dọn phiên NGAY, không thử refresh', () => {
  it('AUTH_011 (tài khoản bị khoá) ⇒ dọn phiên với lý do `locked`', () => {
    fakeSocket.emitFromServer('connect_error', authError('AUTH_011'));

    expect(purgeAuthSession).toHaveBeenCalledTimes(1);
    expect(purgeAuthSession).toHaveBeenCalledWith('locked');
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('AUTH_012 (chờ xoá) ⇒ `locked`; AUTH_010 (bị thu hồi) ⇒ `revoked`', () => {
    fakeSocket.emitFromServer('connect_error', authError('AUTH_012'));
    fakeSocket.emitFromServer('connect_error', authError('AUTH_010'));

    expect(purgeAuthSession).toHaveBeenNthCalledWith(1, 'locked');
    expect(purgeAuthSession).toHaveBeenNthCalledWith(2, 'revoked');
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('lỗi mạng không có data.code ⇒ KHÔNG đụng tới phiên', () => {
    fakeSocket.emitFromServer('connect_error', new Error('xhr poll error'));
    expect(purgeAuthSession).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('data.code không thuộc nhóm AUTH_ ⇒ KHÔNG đụng tới phiên', () => {
    fakeSocket.emitFromServer('connect_error', authError('RT_429'));
    expect(purgeAuthSession).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe('connect_error — token bắt tay không dùng được ⇒ thử refresh TRƯỚC', () => {
  it.each(['AUTH_002', 'AUTH_003', 'AUTH_004'])(
    '%s + refresh thành công ⇒ nối lại, KHÔNG dọn phiên',
    async (code) => {
      refreshSession.mockResolvedValue({ status: 'ok', token: 'token-moi' });

      fakeSocket.emitFromServer('connect_error', authError(code));
      await flush();

      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
      expect(purgeAuthSession).not.toHaveBeenCalled();
    },
  );

  it('refresh nói phiên chết (`unauthenticated`) ⇒ dọn phiên theo lý do máy chủ trả', async () => {
    refreshSession.mockResolvedValue({ status: 'unauthenticated', endReason: 'revoked' });

    fakeSocket.emitFromServer('connect_error', authError('AUTH_003'));
    await flush();

    expect(purgeAuthSession).toHaveBeenCalledTimes(1);
    expect(purgeAuthSession).toHaveBeenCalledWith('revoked');
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('⛔ refresh `unavailable` (BE chập chờn) ⇒ GIỮ phiên và hẹn nối lại', async () => {
    vi.useFakeTimers();
    try {
      refreshSession.mockResolvedValue({ status: 'unavailable', reason: 'HTTP 503' });

      fakeSocket.emitFromServer('connect_error', authError('AUTH_003'));
      await vi.advanceTimersByTimeAsync(0);
      expect(purgeAuthSession).not.toHaveBeenCalled();
      expect(fakeSocket.connect).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5_000);
      expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
      expect(purgeAuthSession).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('đã refresh + nối lại mà handshake VẪN bị từ chối bằng mã token ⇒ phiên chết thật, không lặp vô hạn', async () => {
    refreshSession.mockResolvedValue({ status: 'ok', token: 'token-moi' });

    fakeSocket.emitFromServer('connect_error', authError('AUTH_004'));
    await flush();
    expect(refreshSession).toHaveBeenCalledTimes(1);

    // Lượt nối lại bị từ chối tiếp — KHÔNG refresh lần nữa.
    fakeSocket.emitFromServer('connect_error', authError('AUTH_004'));
    await flush();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(purgeAuthSession).toHaveBeenCalledTimes(1);
    expect(purgeAuthSession).toHaveBeenCalledWith('expired');
  });
});

describe('disconnect do máy chủ ngắt', () => {
  it('`io server disconnect` (khoá tài khoản, đổi mật khẩu…) ⇒ nối lại để handshake phán quyết', () => {
    fakeSocket.emitFromServer('disconnect', 'io server disconnect');
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('người dùng tự ngắt (`io client disconnect`) hoặc mất đường truyền ⇒ KHÔNG tự nối', () => {
    fakeSocket.emitFromServer('disconnect', 'io client disconnect');
    fakeSocket.emitFromServer('disconnect', 'transport close');
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('đã đăng xuất (không còn token) ⇒ KHÔNG nối lại', () => {
    getAccessToken.mockReturnValue(null);
    fakeSocket.emitFromServer('disconnect', 'io server disconnect');
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });
});

describe('session:expiring → auth:refresh', () => {
  it('refresh thành công ⇒ đẩy token mới qua auth:refresh', async () => {
    refreshSession.mockResolvedValue({ status: 'ok', token: 'new-token' });

    fakeSocket.emitFromServer(SocketEvent.SESSION_EXPIRING, { exp: 123, v: 1 });
    await flush();
    await flush();

    expect(fakeSocket.emit).toHaveBeenCalledWith(
      SocketEvent.AUTH_REFRESH,
      { token: 'new-token' },
      expect.any(Function),
    );
  });

  it('refresh thất bại (unauthenticated) ⇒ KHÔNG gửi auth:refresh', async () => {
    refreshSession.mockResolvedValue({ status: 'unauthenticated' });

    fakeSocket.emitFromServer(SocketEvent.SESSION_EXPIRING, { exp: 123, v: 1 });
    await flush();
    await flush();

    expect(fakeSocket.emit).not.toHaveBeenCalledWith(
      SocketEvent.AUTH_REFRESH,
      expect.anything(),
      expect.anything(),
    );
  });
});
