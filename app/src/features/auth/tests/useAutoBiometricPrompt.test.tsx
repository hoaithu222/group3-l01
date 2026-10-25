import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { apiClient } from '@/core/api';
import { useAutoBiometricPrompt } from '@/features/auth/hooks/useAutoBiometricPrompt';
import { clearExplicitLogout, markExplicitLogout } from '@/shell/session/logout-intent';

/**
 * `useAutoBiometricPrompt` — BIO-12: tự bật hộp quét ĐÚNG MỘT LẦN mỗi lượt vào
 * màn Đăng nhập, không lặp phiền toái.
 *
 * `useCapabilities()` (dùng để đọc `lockAfterBackgroundSeconds`) mock ở tầng
 * `apiClient.get` — cùng kỹ thuật với `tests/shell/capabilities.test.tsx` —
 * để không có request mạng thật nào rời khỏi test này.
 */
jest.mock('@/core/api', () => {
  const actual = jest.requireActual('@/core/api');
  return { ...actual, apiClient: { ...actual.apiClient, get: jest.fn() } };
});

const mockedGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

/** `jest.spyOn` thẳng vào `AppState.addEventListener` — mẫu từ `tests/core/socket.test.ts`. */
let appStateListener: ((state: AppStateStatus) => void) | null = null;

/**
 * ⚠️ `await act(async () => …)`, KHÔNG phải `act(() => …)` đồng bộ.
 *
 * Bản `@testing-library/react-native` 14 + React 19 dùng ở đây chỉ thật sự
 * FLUSH lượt cập nhật state khi `act` callback là async VÀ được `await` — bọc
 * đồng bộ vẫn chạy callback (listener vẫn được gọi) nhưng `result.current` của
 * `renderHook` không cập nhật tới lượt render kế tiếp, và test đọc nhầm giá
 * trị CŨ mà không có lỗi nào báo. Đã xác nhận bằng tái hiện tối giản trước khi
 * viết bộ test này.
 */
async function triggerAppState(state: AppStateStatus): Promise<void> {
  await act(async () => {
    appStateListener?.(state);
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  clearExplicitLogout();
  mockedGet.mockResolvedValue({
    data: { success: true, data: { auth: { appLock: { lockAfterBackgroundSeconds: 300 } } } },
  } as never);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    appStateListener = callback as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('một lần mỗi lượt vào màn', () => {
  it('available=true ⇒ tự gọi trigger() sau 600ms, ĐÚNG MỘT LẦN', async () => {
    const trigger = jest.fn().mockResolvedValue(undefined);
    await renderHook(() => useAutoBiometricPrompt(true, trigger), { wrapper: createWrapper() });

    expect(trigger).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(600);
    expect(trigger).toHaveBeenCalledTimes(1);

    // Vẽ lại nhiều lần (giả lập re-render bình thường của màn hình) không
    // được sinh thêm lượt gọi nào — "đã dùng" là một CHỐT, không phải đếm ngược.
    await jest.advanceTimersByTimeAsync(600);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('available=false ⇒ không bao giờ tự gọi', async () => {
    const trigger = jest.fn().mockResolvedValue(undefined);
    await renderHook(() => useAutoBiometricPrompt(false, trigger), { wrapper: createWrapper() });

    await jest.advanceTimersByTimeAsync(1000);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('claim() giành chốt TRƯỚC khi bộ đếm chạy ⇒ không tự bật nữa', async () => {
    const trigger = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderHook(() => useAutoBiometricPrompt(true, trigger), {
      wrapper: createWrapper(),
    });

    result.current.claim();
    await jest.advanceTimersByTimeAsync(600);

    expect(trigger).not.toHaveBeenCalled();
  });
});

describe('wasExplicitLogout() ⇒ không tự bật', () => {
  it('vừa đăng xuất chủ động ⇒ bỏ qua tự động, dù available=true', async () => {
    markExplicitLogout();
    const trigger = jest.fn().mockResolvedValue(undefined);

    await renderHook(() => useAutoBiometricPrompt(true, trigger), { wrapper: createWrapper() });
    await jest.advanceTimersByTimeAsync(1000);

    expect(trigger).not.toHaveBeenCalled();
  });
});

describe('inactive → active KHÔNG được nạp lại lượt (hộp Face ID của iOS)', () => {
  it('đã dùng lượt, rồi app inactive → active ⇒ KHÔNG tự bật lại', async () => {
    const trigger = jest.fn().mockResolvedValue(undefined);
    await renderHook(() => useAutoBiometricPrompt(true, trigger), { wrapper: createWrapper() });

    await jest.advanceTimersByTimeAsync(600);
    expect(trigger).toHaveBeenCalledTimes(1);

    await triggerAppState('inactive');
    await triggerAppState('active');
    await jest.advanceTimersByTimeAsync(1000);

    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('đã dùng lượt, rồi ở NỀN đủ lâu (≥ ngưỡng) mới nạp lại lượt', async () => {
    const trigger = jest.fn().mockResolvedValue(undefined);
    await renderHook(() => useAutoBiometricPrompt(true, trigger), { wrapper: createWrapper() });

    await jest.advanceTimersByTimeAsync(600);
    expect(trigger).toHaveBeenCalledTimes(1);

    await triggerAppState('background');
    await jest.advanceTimersByTimeAsync(300_000); // 300s = ngưỡng cấu hình trong beforeEach
    await triggerAppState('active');
    await jest.advanceTimersByTimeAsync(600);

    expect(trigger).toHaveBeenCalledTimes(2);
  });
});
