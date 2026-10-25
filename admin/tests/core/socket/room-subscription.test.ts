/**
 * `useRoomSubscription` — registry refcount phòng đang mở + rejoin sau khi
 * `connect` lại (p0-03). Mẫu mock theo `tests/core/socket.test.ts`: mock
 * `socket.io-client` trả về MỘT fake socket dùng chung cho cả file test.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/api/session', () => ({
  getAccessToken: () => null,
  purgeAuthSession: vi.fn(),
  refreshSession: vi.fn(),
}));

type Handler = (...args: unknown[]) => void;
type Ack = { code?: string; ok: boolean };

function createFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  let ackResponse: Ack = { ok: true };
  return {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn((_event: string, _payload: unknown, ack?: (a: Ack) => void) => {
      ack?.(ackResponse);
    }),
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
    setAck: (next: Ack) => {
      ackResponse = next;
    },
  };
}

const fakeSocket = createFakeSocket();

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

const { resetRoomSubscriptions, useRoomSubscription } = await import(
  '@/core/socket/useRoomSubscription'
);
const { SocketEvent } = await import('@/core/socket/socket.events');

function joinCalls() {
  return fakeSocket.emit.mock.calls.filter(([event]) => event === SocketEvent.JOIN_ROOM);
}
function leaveCalls() {
  return fakeSocket.emit.mock.calls.filter(([event]) => event === SocketEvent.LEAVE_ROOM);
}

beforeEach(() => {
  fakeSocket.emit.mockClear();
  fakeSocket.setAck({ ok: true });
  resetRoomSubscriptions();
});

describe('useRoomSubscription — refcount', () => {
  it('hai hook CÙNG quan tâm một phòng ⇒ chỉ MỘT room:join, cả hai đều thấy joined', async () => {
    const hookA = renderHook(() => useRoomSubscription('admin', 'ops'));
    const hookB = renderHook(() => useRoomSubscription('admin', 'ops'));

    await waitFor(() => expect(hookA.result.current).toEqual({ status: 'joined' }));
    expect(hookB.result.current).toEqual({ status: 'joined' });
    expect(joinCalls()).toHaveLength(1);
    expect(joinCalls()[0][1]).toEqual({ id: 'ops', kind: 'admin' });
  });

  it('unmount MỘT trong hai ⇒ chưa room:leave; unmount NỐT cái còn lại ⇒ ĐÚNG một room:leave', async () => {
    const hookA = renderHook(() => useRoomSubscription('admin', 'ops'));
    const hookB = renderHook(() => useRoomSubscription('admin', 'ops'));
    await waitFor(() => expect(hookA.result.current).toEqual({ status: 'joined' }));

    hookA.unmount();
    expect(leaveCalls()).toHaveLength(0);

    hookB.unmount();
    expect(leaveCalls()).toHaveLength(1);
    expect(leaveCalls()[0][1]).toEqual({ id: 'ops', kind: 'admin' });
  });

  it('hai phòng KHÁC nhau ⇒ mỗi phòng một room:join riêng', async () => {
    renderHook(() => useRoomSubscription('admin', 'ops'));
    renderHook(() => useRoomSubscription('ws', 'w1'));

    await waitFor(() => expect(joinCalls()).toHaveLength(2));
  });

  it('enabled=false hoặc thiếu id ⇒ KHÔNG join, trạng thái luôn pending', () => {
    const { result } = renderHook(() => useRoomSubscription('admin', null));
    expect(result.current).toEqual({ status: 'pending' });
    expect(joinCalls()).toHaveLength(0);
  });
});

describe('useRoomSubscription — denied', () => {
  it('BE từ chối ack ⇒ status denied kèm code', async () => {
    fakeSocket.setAck({ code: 'RT_403', ok: false });
    const { result } = renderHook(() => useRoomSubscription('admin', 'ops'));

    await waitFor(() => expect(result.current).toEqual({ code: 'RT_403', status: 'denied' }));
  });
});

describe('useRoomSubscription — rejoin sau khi connect lại', () => {
  it('phòng còn refcount > 0 ⇒ join LẠI khi socket connect', async () => {
    const { result } = renderHook(() => useRoomSubscription('admin', 'ops'));
    await waitFor(() => expect(result.current).toEqual({ status: 'joined' }));
    fakeSocket.emit.mockClear();

    act(() => {
      fakeSocket.emitFromServer('connect');
    });

    await waitFor(() => expect(joinCalls()).toHaveLength(1));
    await waitFor(() => expect(result.current).toEqual({ status: 'joined' }));
  });

  it('phòng đã release (refcount về 0) ⇒ KHÔNG join lại khi connect', async () => {
    const { result, unmount } = renderHook(() => useRoomSubscription('admin', 'ops'));
    await waitFor(() => expect(result.current).toEqual({ status: 'joined' }));
    unmount();
    fakeSocket.emit.mockClear();

    fakeSocket.emitFromServer('connect');

    expect(joinCalls()).toHaveLength(0);
  });
});
