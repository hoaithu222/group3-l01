import { io } from 'socket.io-client';

import { acquireRoom, resetRoomSubscriptions } from '@/core/socket/room-subscriptions';
import { SocketEvent } from '@/core/socket/socket.events';

/**
 * `room-subscriptions.ts` — registry refcount phòng đang mở.
 *
 * ⚠️ Mẫu mock lấy từ `tests/core/socket.test.ts`: `socket.io-client` mock TOÀN
 * CỤC ở `jest.setup.js`, lấy `socket` qua `mock.results` của `io`, và lấy
 * handler `connect` (đăng ký lúc nạp module — side-effect) NGAY BÂY GIỜ, TRƯỚC
 * `jest.clearAllMocks()` xoá dấu vết của lượt gọi `on()` đó.
 */
const mockedIo = io as jest.MockedFunction<typeof io>;
interface MockSocket {
  connect: jest.Mock;
  connected: boolean;
  disconnect: jest.Mock;
  emit: jest.Mock;
  off: jest.Mock;
  on: jest.Mock;
  __reset: () => void;
}
const mockSocket = mockedIo.mock.results[0]?.value as MockSocket;

const connectHandler = mockSocket.on.mock.calls.find(([event]) => event === 'connect')?.[1] as
  | (() => void)
  | undefined;

/** Ack của mock trả lời NGAY trong `emit()`, nhưng `await emitWithAck(...)` vẫn qua ít nhất một lượt microtask. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function joinCalls() {
  return mockSocket.emit.mock.calls.filter(([event]) => event === SocketEvent.JOIN_ROOM);
}
function leaveCalls() {
  return mockSocket.emit.mock.calls.filter(([event]) => event === SocketEvent.LEAVE_ROOM);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket.__reset();
  resetRoomSubscriptions();
});

describe('acquireRoom — refcount', () => {
  it('hai lượt quan tâm CÙNG một phòng ⇒ chỉ MỘT room:join', async () => {
    const releaseA = acquireRoom('conv', 'c1', jest.fn());
    const releaseB = acquireRoom('conv', 'c1', jest.fn());
    await flush();

    expect(joinCalls()).toHaveLength(1);
    expect(joinCalls()[0][1]).toEqual({ id: 'c1', kind: 'conv' });

    releaseA();
    releaseB();
  });

  it('rời MỘT trong hai ⇒ CHƯA room:leave; rời NỐT cái còn lại ⇒ ĐÚNG một room:leave', async () => {
    const releaseA = acquireRoom('conv', 'c1', jest.fn());
    const releaseB = acquireRoom('conv', 'c1', jest.fn());
    await flush();

    releaseA();
    expect(leaveCalls()).toHaveLength(0);

    releaseB();
    await flush();
    expect(leaveCalls()).toHaveLength(1);
    expect(leaveCalls()[0][1]).toEqual({ id: 'c1', kind: 'conv' });
  });

  it('hai phòng KHÁC nhau ⇒ mỗi phòng một room:join riêng', async () => {
    acquireRoom('conv', 'c1', jest.fn());
    acquireRoom('conv', 'c2', jest.fn());
    await flush();

    expect(joinCalls()).toHaveLength(2);
  });
});

describe('rejoin sau khi `connect` lại', () => {
  it('phòng còn refcount > 0 ⇒ join LẠI', async () => {
    acquireRoom('conv', 'c1', jest.fn());
    await flush();
    mockSocket.emit.mockClear();

    connectHandler?.();
    await flush();

    expect(joinCalls()).toHaveLength(1);
    expect(joinCalls()[0][1]).toEqual({ id: 'c1', kind: 'conv' });
  });

  it('phòng đã release (refcount về 0) ⇒ KHÔNG join lại', async () => {
    const release = acquireRoom('conv', 'c1', jest.fn());
    await flush();
    release();
    await flush();
    mockSocket.emit.mockClear();

    connectHandler?.();
    await flush();

    expect(joinCalls()).toHaveLength(0);
  });
});
