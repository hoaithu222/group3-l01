import { act, renderHook } from '@testing-library/react-native';
import { io } from 'socket.io-client';

import { scopeKeyOf, useTypingStore } from '@/core/socket/typing/typing.store';
import { useTypingEmitter } from '@/core/socket/typing/use-typing-emitter';
import { useTypingIndicator } from '@/core/socket/typing/use-typing-indicator';
import { SocketEvent } from '@/core/socket/socket.events';
import { useAuthStore } from '@/shell/store/slices/auth';

const mockedIo = io as jest.MockedFunction<typeof io>;
interface MockSocket {
  emit: jest.Mock;
  off: jest.Mock;
  on: jest.Mock;
  __emitServer: (event: string, payload?: unknown) => void;
  __reset: () => void;
}
const mockSocket = mockedIo.mock.results[0]?.value as MockSocket;

function startCalls() {
  return mockSocket.emit.mock.calls.filter(([event]) => event === SocketEvent.TYPING_START);
}
function stopCalls() {
  return mockSocket.emit.mock.calls.filter(([event]) => event === SocketEvent.TYPING_STOP);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSocket.__reset();
  useTypingStore.getState().reset();
  useAuthStore.getState().clearAuth();
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * `useTypingEmitter` KHÔNG có `useState` nào (chỉ `useRef`/`useCallback`) — gọi
 * `onChangeText()`/`stop()` không kéo theo một lượt render nào của React, nên
 * KHÔNG bọc `act()`. Bọc thừa quanh cả timer lẫn Promise nội bộ của
 * `emitWithAck` (`void`, cố ý không `await`) là đúng thứ khiến React 19 bối rối
 * với "act(async () => ...) without await" và làm HỎNG lượt render/mount của
 * `renderHook` ở TEST SAU — đã tái hiện và xác nhận trước khi viết theo cách này.
 */
describe('useTypingEmitter — throttle 3s cho typing:start', () => {
  it('gõ liên tục < 3s ⇒ chỉ MỘT typing:start; đủ 3s gõ tiếp ⇒ gửi lại', async () => {
    const { result, unmount } = await renderHook(() => useTypingEmitter('conv', 'c1'));

    result.current.onChangeText();
    result.current.onChangeText();
    expect(startCalls()).toHaveLength(1);

    jest.advanceTimersByTime(3000);
    result.current.onChangeText();
    expect(startCalls()).toHaveLength(2);

    result.current.stop();
    unmount();
  });

  it('stop() (gửi/blur) ⇒ typing:stop, và gõ lại NGAY gửi typing:start mới (không bị throttle)', async () => {
    const { result, unmount } = await renderHook(() => useTypingEmitter('conv', 'c1'));

    result.current.onChangeText();
    result.current.stop();
    expect(stopCalls()).toHaveLength(1);

    result.current.onChangeText();
    expect(startCalls()).toHaveLength(2);

    unmount();
  });

  it('im lặng 2s không gõ tiếp ⇒ tự gửi typing:stop', async () => {
    const { result, unmount } = await renderHook(() => useTypingEmitter('conv', 'c1'));

    result.current.onChangeText();
    jest.advanceTimersByTime(2000);

    expect(stopCalls()).toHaveLength(1);
    unmount();
  });
});

describe('typing.store — tự hết hạn 6s', () => {
  /**
   * ⚠️ `remove()`/hẹn giờ hết hạn chỉ xoá ĐÚNG userId khỏi map con của scope —
   * scope RỖNG vẫn còn là `{}` (khoá `scopeKey` không tự biến mất khỏi
   * `byScope`). Đây là hành vi CHỦ Ý (đơn giản hơn "GC" khoá rỗng, và
   * `useTypingIndicator` đọc `Object.keys({}) → []` giống hệt trường hợp chưa
   * từng có ai gõ), ⛔ đừng kỳ vọng `byScope[scopeKey]` trả về `undefined`.
   */
  it('add() rồi KHÔNG nhận stop ⇒ sau 6s tự xoá khỏi scope', () => {
    const scopeKey = scopeKeyOf('conv', 'c1');

    useTypingStore.getState().add(scopeKey, 'user-2');
    expect(useTypingStore.getState().byScope[scopeKey]).toHaveProperty('user-2');

    jest.advanceTimersByTime(6000);
    expect(useTypingStore.getState().byScope[scopeKey]).not.toHaveProperty('user-2');
  });

  it('add() lại TRƯỚC khi hết hạn ⇒ huỷ hẹn giờ cũ, không bị xoá sớm', () => {
    const scopeKey = scopeKeyOf('conv', 'c1');

    useTypingStore.getState().add(scopeKey, 'user-2');
    jest.advanceTimersByTime(5000);
    useTypingStore.getState().add(scopeKey, 'user-2'); // renew

    jest.advanceTimersByTime(5000); // tổng 10s kể từ lần add đầu, nhưng mới 5s kể từ lần renew
    expect(useTypingStore.getState().byScope[scopeKey]).toHaveProperty('user-2');

    jest.advanceTimersByTime(1000); // đủ 6s kể từ lần renew
    expect(useTypingStore.getState().byScope[scopeKey]).not.toHaveProperty('user-2');
  });

  it('remove() thủ công (nhận typing:stop) ⇒ xoá ngay, không cần chờ hết hạn', () => {
    const scopeKey = scopeKeyOf('conv', 'c1');
    useTypingStore.getState().add(scopeKey, 'user-2');
    useTypingStore.getState().remove(scopeKey, 'user-2');

    expect(useTypingStore.getState().byScope[scopeKey]).not.toHaveProperty('user-2');
  });
});

/**
 * ⚠️ `await act(async () => {…})`, KHÔNG phải `act(() => {…})` đồng bộ.
 *
 * `useTypingIndicator` đọc `useTypingStore` qua `useSyncExternalStore`
 * (Zustand v5) — cập nhật store NGOÀI một sự kiện React (ở đây là mô phỏng
 * server bắn `typing` qua `mockSocket.__emitServer`) chỉ thật sự cho
 * `result.current` (chính nó cũng cập nhật trong MỘT `useEffect`, xem
 * `render-hook.js` của RNTL) thấy giá trị mới nếu `act` là BẤT ĐỒNG BỘ — bản
 * đồng bộ để lại `result.current` CŨ dù state bên trong đã đổi đúng, không có
 * lỗi nào báo. Đã tái hiện tối giản (`useTypingStore` selector trần, không
 * qua hook nào khác) trước khi kết luận đây không phải lỗi ở `typing.store.ts`.
 */
describe('useTypingIndicator — bỏ qua sự kiện của chính mình', () => {
  it('userId trùng người dùng hiện tại ⇒ KHÔNG thêm vào danh sách đang gõ', async () => {
    useAuthStore.getState().setAuth({
      user: { email: 'me@x.com', id: 'me', name: 'Me', permissions: [], roles: [] },
    });

    const { result, unmount } = await renderHook(() => useTypingIndicator('conv', 'c1'));

    await act(async () => {
      mockSocket.__emitServer(SocketEvent.TYPING, {
        scopeId: 'c1',
        scopeType: 'conv',
        serverNow: Date.now(),
        state: 'start',
        userId: 'me',
        v: 1,
      });
    });
    expect(result.current).toEqual([]);

    await act(async () => {
      mockSocket.__emitServer(SocketEvent.TYPING, {
        scopeId: 'c1',
        scopeType: 'conv',
        serverNow: Date.now(),
        state: 'start',
        userId: 'other',
        v: 1,
      });
    });
    expect(result.current).toEqual(['other']);

    unmount();
  });

  it('sự kiện của một scope KHÁC ⇒ không lọt vào danh sách của scope đang xem', async () => {
    const { result, unmount } = await renderHook(() => useTypingIndicator('conv', 'c1'));

    await act(async () => {
      mockSocket.__emitServer(SocketEvent.TYPING, {
        scopeId: 'c-khac',
        scopeType: 'conv',
        serverNow: Date.now(),
        state: 'start',
        userId: 'other',
        v: 1,
      });
    });

    expect(result.current).toEqual([]);
    unmount();
  });
});
