/**
 * Socket.IO client — hai điều phải giữ đúng:
 *  1. `connectSocket()` KHÔNG nối khi chưa có token (chưa đăng nhập).
 *  2. `useSocketEvent` đăng ký lúc mount, huỷ đăng ký lúc unmount — không rò
 *     listener giữa các lần chuyển trang.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAccessToken = vi.fn<() => string | null>();
const refreshSession = vi.fn();

vi.mock('@/core/api/session', () => ({
  getAccessToken: (...args: unknown[]) => getAccessToken(...(args as [])),
  refreshSession: (...args: unknown[]) => refreshSession(...(args as [])),
}));

type Handler = (...args: unknown[]) => void;

function createFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  return {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, cb: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), cb]);
    }),
    off: vi.fn((event: string, cb: Handler) => {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((h) => h !== cb),
      );
    }),
    emitFromServer: (event: string, ...args: unknown[]) => {
      (handlers.get(event) ?? []).forEach((h) => h(...args));
    },
  };
}

const fakeSocket = createFakeSocket();

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

const { connectSocket, disconnectSocket, SocketEvent, useSocketEvent } =
  await import('@/core/socket');

describe('connectSocket / disconnectSocket', () => {
  beforeEach(() => {
    fakeSocket.connect.mockClear();
    fakeSocket.disconnect.mockClear();
    fakeSocket.connected = false;
    getAccessToken.mockReset();
  });

  it('KHÔNG nối khi chưa có access token', () => {
    getAccessToken.mockReturnValue(null);
    connectSocket();
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('nối khi đã có access token', () => {
    getAccessToken.mockReturnValue('token-that');
    connectSocket();
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('không gọi connect lần nữa nếu đã đang nối', () => {
    getAccessToken.mockReturnValue('token-that');
    fakeSocket.connected = true;
    connectSocket();
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('disconnectSocket() ngắt khi đang nối, bỏ qua khi đã ngắt', () => {
    fakeSocket.connected = true;
    disconnectSocket();
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);

    fakeSocket.disconnect.mockClear();
    fakeSocket.connected = false;
    disconnectSocket();
    expect(fakeSocket.disconnect).not.toHaveBeenCalled();
  });
});

describe('useSocketEvent', () => {
  it('đăng ký lúc mount, nhận đúng payload, huỷ đăng ký lúc unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useSocketEvent(SocketEvent.NOTIFICATION_CREATED, handler));

    expect(fakeSocket.on).toHaveBeenCalledWith(
      SocketEvent.NOTIFICATION_CREATED,
      expect.any(Function),
    );

    fakeSocket.emitFromServer(SocketEvent.NOTIFICATION_CREATED, { id: '1' });
    expect(handler).toHaveBeenCalledWith({ id: '1' });

    unmount();
    expect(fakeSocket.off).toHaveBeenCalledWith(
      SocketEvent.NOTIFICATION_CREATED,
      expect.any(Function),
    );

    handler.mockClear();
    fakeSocket.emitFromServer(SocketEvent.NOTIFICATION_CREATED, { id: '2' });
    expect(handler).not.toHaveBeenCalled();
  });
});
