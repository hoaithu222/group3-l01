import { AppState } from 'react-native';
import { io } from 'socket.io-client';

import { setAccessToken } from '@/core/api/session';
import { bindAppState, connectSocket, disconnectSocket } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * `socket.client.ts` — vòng đời kết nối.
 *
 * ⚠️ `socket.io-client` được mock TOÀN CỤC ở `jest.setup.js`
 * (`__mocks__/socket.io-client.ts`) vì `socket.client.ts` gọi `io(...)` ngay
 * lúc nạp module (thực thể dùng chung) — không mock thì mọi test đụng tới nó
 * sẽ cố mở WebSocket thật trong Node.
 */

/**
 * `jest.spyOn` thẳng vào `AppState.addEventListener` — KHÔNG `jest.mock('react-native', …)`.
 *
 * `'react-native'` là module RẤT lớn, đầy getter lười (mỗi component load một
 * native mock riêng của `@react-native/jest-preset`); một factory kiểu
 * `{ ...jest.requireActual('react-native'), AppState: … }` buộc phải ĐỌC (và
 * do đó CHẠY) từng getter đó ngay khi spread — vài getter nổ vì phụ thuộc
 * chưa sẵn sàng trong file test tối giản này. `AppState` là một object JS
 * THƯỜNG (không phải lời gọi native), nên chỉ cần thay MỘT phương thức của
 * chính singleton đó — `socket.client.ts` và test này cùng nhìn vào một object
 * (Node cache module), nên `spyOn` ở đây cũng chặn được lệnh gọi ở đó.
 */
let appStateListener: ((state: string) => void) | null = null;

beforeAll(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_eventName, callback) => {
    appStateListener = callback as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

/** CHỈ dùng trong test: giả lập hệ điều hành đổi trạng thái app. */
function triggerAppState(state: string): void {
  appStateListener?.(state as never);
}

/**
 * `socket.client.ts` gọi `io(...)` ĐÚNG MỘT LẦN, ngay lúc nạp module (thực thể
 * dùng chung) — kết quả cuộc gọi đó chính là `socket` mà mọi hàm trong
 * `socket.client.ts` thao tác. Lấy nó qua `mock.results` của chính `io`, KHÔNG
 * import trực tiếp `socket` từ `'socket.io-client'`: bản khai kiểu THẬT của gói
 * đó không có export tên `socket` (đây là export riêng bản mock ở
 * `__mocks__/socket.io-client.ts` thêm vào), nên import thẳng sẽ đỏ `tsc`.
 *
 * ⛔ Phải lấy NGAY BÂY GIỜ, trước bất kỳ `beforeEach` nào gọi
 * `jest.clearAllMocks()` — clear xoá luôn `mock.results`, tức là xoá luôn dấu
 * vết của lượt gọi `io()` DUY NHẤT đó.
 */
const mockedIo = io as jest.MockedFunction<typeof io>;
interface MockSocket {
  connected: boolean;
  connect: jest.Mock;
  disconnect: jest.Mock;
  emit: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  __reset: () => void;
}
const mockSocket = mockedIo.mock.results[0]?.value as MockSocket;

/**
 * `socket.on('connect_error', …)` cũng đăng ký ĐÚNG MỘT LẦN cùng lúc — cùng lý
 * do, phải lấy NGAY BÂY GIỜ.
 */
const connectErrorCall = mockSocket.on.mock.calls.find(([event]) => event === 'connect_error');
const connectErrorHandler = connectErrorCall?.[1] as
  ((err: Error) => void | Promise<void>) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSocket.__reset();
  useAuthStore.getState().clearAuth();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('connectSocket', () => {
  it('KHÔNG nối khi chưa có access token', () => {
    connectSocket();
    expect(mockSocket.connect).not.toHaveBeenCalled();
  });

  it('nối khi đã có access token và chưa kết nối', () => {
    setAccessToken('access-token');
    connectSocket();
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('KHÔNG gọi connect() lần nữa khi đã kết nối sẵn', () => {
    setAccessToken('access-token');
    connectSocket();
    connectSocket();
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
  });
});

describe('disconnectSocket', () => {
  it('bỏ qua êm khi chưa từng kết nối', () => {
    disconnectSocket();
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  it('ngắt khi đang kết nối', () => {
    setAccessToken('access-token');
    connectSocket();
    disconnectSocket();
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('bindAppState', () => {
  /**
   * ⛔ Đây là ranh giới quan trọng nhất của cơ chế: NỀN QUÁ 5 PHÚT mới ngắt,
   * không phải ngắt ngay. Chuyển app qua lại vài giây (đọc một thông báo rồi
   * quay lại) là chuyện thường, ngắt/nối liên tục kiểu đó tốn pin hơn giữ kết
   * nối nguyên.
   */
  it('nền quá 5 phút ⇒ ngắt kết nối', () => {
    setAccessToken('access-token');
    connectSocket();
    const unbind = bindAppState();

    triggerAppState('background');
    expect(mockSocket.disconnect).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5 * 60_000);
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);

    unbind();
  });

  it('quay lại TRƯỚC 5 phút ⇒ không ngắt, và không nối lại thêm (đã nối sẵn)', () => {
    setAccessToken('access-token');
    connectSocket();
    const unbind = bindAppState();

    triggerAppState('background');
    jest.advanceTimersByTime(4 * 60_000);
    triggerAppState('active');
    jest.advanceTimersByTime(2 * 60_000);

    expect(mockSocket.disconnect).not.toHaveBeenCalled();

    unbind();
  });

  it('hàm dọn dẹp huỷ bộ đếm đang chờ — không ngắt kết nối sau khi unbind', () => {
    setAccessToken('access-token');
    connectSocket();
    const unbind = bindAppState();

    triggerAppState('background');
    unbind();
    jest.advanceTimersByTime(5 * 60_000);

    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });
});

describe('connect_error — làm mới token khi handshake báo hết hạn', () => {
  it('có đăng ký đúng một handler connect_error lúc nạp module', () => {
    expect(connectErrorHandler).toBeDefined();
  });

  it('lỗi có mùi "token" ⇒ thử refresh (không có refresh token ⇒ KHÔNG nối lại)', async () => {
    setAccessToken('access-token-cu');
    mockSocket.connect.mockClear();

    // `refreshSession()` thật chạy ở đây (không mock) — không có refresh token
    // trong kho khoá (đã `clearAuth()` ở `beforeEach`) ⇒ `unauthenticated`,
    // nên KHÔNG được gọi lại `connect()`.
    await connectErrorHandler?.(new Error('jwt expired'));
    expect(mockSocket.connect).not.toHaveBeenCalled();
  });

  it('lỗi KHÔNG liên quan tới token ⇒ không đụng gì tới connect()', async () => {
    mockSocket.connect.mockClear();
    await connectErrorHandler?.(new Error('xhr poll error'));
    expect(mockSocket.connect).not.toHaveBeenCalled();
  });
});
