import { act, renderHook } from '@testing-library/react-native';
import { io } from 'socket.io-client';

import { resetRoomSubscriptions } from '@/core/socket/room-subscriptions';
import { SocketEvent } from '@/core/socket/socket.events';
import { useRoomSubscription } from '@/core/socket/use-room-subscription';

const mockedIo = io as jest.MockedFunction<typeof io>;
interface MockSocket {
  emit: jest.Mock;
  __reset: () => void;
}
const mockSocket = mockedIo.mock.results[0]?.value as MockSocket;

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket.__reset();
  resetRoomSubscriptions();
});

/** Đợi ack (mock trả lời NGAY, nhưng `await emitWithAck` vẫn qua microtask) — bọc trong `act` để flush `setStatus`. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useRoomSubscription — ack lỗi', () => {
  it('ack {ok:false, code:"PERM_404"} ⇒ status "denied" kèm đúng code', async () => {
    mockSocket.emit.mockImplementation(
      (event: string, _payload: unknown, ack?: (result: unknown) => void) => {
        if (event === SocketEvent.JOIN_ROOM) ack?.({ code: 'PERM_404', ok: false });
        else ack?.({ ok: true });
      },
    );

    // `await renderHook(...)` của RNTL 14 đã tự chờ hết effect + microtask đang
    // chờ (bao gồm cả ack đồng bộ của mock) — tới đây `status` đã ổn định.
    const { result } = await renderHook(() => useRoomSubscription('conv', 'c1'));
    await flush();

    expect(result.current).toEqual({ code: 'PERM_404', status: 'denied' });
  });

  it('ack {ok:true} ⇒ status "joined"', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, ack?: (result: unknown) => void) => ack?.({ ok: true }),
    );

    const { result } = await renderHook(() => useRoomSubscription('conv', 'c2'));
    await flush();

    expect(result.current).toEqual({ status: 'joined' });
  });

  it('`enabled: false` ⇒ không join, luôn "pending"', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, ack?: (result: unknown) => void) =>
        ack?.({ code: 'PERM_404', ok: false }),
    );

    const { result } = await renderHook(() =>
      useRoomSubscription('conv', 'c3', { enabled: false }),
    );
    await flush();

    expect(result.current).toEqual({ status: 'pending' });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});
