import { AppState } from 'react-native';
import { io } from 'socket.io-client';

import { bindPresenceHeartbeat } from '@/core/socket/presence/presence-heartbeat';
import { usePresenceStore } from '@/core/socket/presence/presence.store';
import { SocketEvent } from '@/core/socket/socket.events';

/** Mẫu `jest.spyOn(AppState, 'addEventListener')` — xem `tests/core/socket.test.ts` để biết vì sao KHÔNG `jest.mock('react-native', …)`. */
let appStateListener: ((state: string) => void) | null = null;

beforeAll(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    appStateListener = callback as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

function triggerAppState(state: string): void {
  appStateListener?.(state);
}

const mockedIo = io as jest.MockedFunction<typeof io>;
interface MockSocket {
  connected: boolean;
  emit: jest.Mock;
  off: jest.Mock;
  on: jest.Mock;
  __reset: () => void;
}
const mockSocket = mockedIo.mock.results[0]?.value as MockSocket;

function heartbeatCalls() {
  return mockSocket.emit.mock.calls.filter(([event]) => event === SocketEvent.PRESENCE_HEARTBEAT);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSocket.__reset();
  mockSocket.connected = true;
  appStateListener = null;
  usePresenceStore.getState().reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('bindPresenceHeartbeat', () => {
  it('bind() ⇒ gửi {active:true} NGAY (coi là đang foreground), rồi LẠI mỗi 30s', () => {
    const { unbind } = bindPresenceHeartbeat();

    expect(heartbeatCalls()).toHaveLength(1);
    expect(heartbeatCalls()[0][1]).toEqual({ active: true });

    mockSocket.emit.mockClear();
    jest.advanceTimersByTime(30_000);
    expect(heartbeatCalls()).toHaveLength(1);
    expect(heartbeatCalls()[0][1]).toEqual({ active: true });

    unbind();
  });

  it('"background" ⇒ dừng timer, không gửi thêm dù để trôi lâu', () => {
    const { unbind } = bindPresenceHeartbeat();
    mockSocket.emit.mockClear();

    triggerAppState('background');
    jest.advanceTimersByTime(120_000);

    expect(heartbeatCalls()).toHaveLength(0);
    unbind();
  });

  it('không chạm quá 5 phút ⇒ tick kế tiếp gửi {active:false}', () => {
    const { unbind } = bindPresenceHeartbeat();

    jest.advanceTimersByTime(5 * 60_000 + 30_000);

    expect(heartbeatCalls().at(-1)?.[1]).toEqual({ active: false });
    unbind();
  });

  it('quay lại "active" TRƯỚC khi hết 5 phút ⇒ heartbeat kế tiếp vẫn {active:true}', () => {
    const { unbind } = bindPresenceHeartbeat();

    triggerAppState('background');
    jest.advanceTimersByTime(60_000);
    triggerAppState('active');
    mockSocket.emit.mockClear();
    jest.advanceTimersByTime(30_000);

    expect(heartbeatCalls().at(-1)?.[1]).toEqual({ active: true });
    unbind();
  });

  it('touch() — gọi liên tục (chưa quá 60s) chỉ gửi MỘT lần', () => {
    const { touch, unbind } = bindPresenceHeartbeat();
    mockSocket.emit.mockClear();

    touch();
    touch();
    touch();

    expect(heartbeatCalls()).toHaveLength(1);
    expect(heartbeatCalls()[0][1]).toEqual({ active: true });
    unbind();
  });

  it('touch() — cách nhau ĐỦ 60s ⇒ gửi lại', () => {
    const { touch, unbind } = bindPresenceHeartbeat();
    mockSocket.emit.mockClear();

    touch();
    // ⚠️ 60s cũng vô tình băng qua 1-2 tick định kỳ (30s/lần) — không đếm TỔNG
    // số cuộc gọi, chỉ so ĐỘ CHÊNH LỆCH quanh lượt `touch()` thứ hai để tách
    // hẳn khỏi nhiễu của interval.
    jest.advanceTimersByTime(60_000);
    const before = heartbeatCalls().length;

    touch();

    expect(heartbeatCalls()).toHaveLength(before + 1);
    unbind();
  });

  it('unbind() ⇒ không còn gửi heartbeat theo chu kỳ nữa', () => {
    const { unbind } = bindPresenceHeartbeat();
    unbind();
    mockSocket.emit.mockClear();

    jest.advanceTimersByTime(60_000);

    expect(heartbeatCalls()).toHaveLength(0);
  });

  it('nhận `presence:updated` ⇒ ghi vào presence.store', () => {
    const { unbind } = bindPresenceHeartbeat();

    mockSocket.on.mock.calls
      .filter(([event]) => event === SocketEvent.PRESENCE_UPDATED)
      .forEach(([, handler]) => {
        (handler as (payload: unknown) => void)({
          serverNow: 123,
          state: 'ONLINE',
          userId: 'u1',
          v: 1,
        });
      });

    expect(usePresenceStore.getState().byUserId.u1).toEqual({ state: 'ONLINE', updatedAt: 123 });
    unbind();
  });
});
