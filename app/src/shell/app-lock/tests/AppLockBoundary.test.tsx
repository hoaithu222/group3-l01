import { act, renderHook } from '@testing-library/react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { AppState, Platform } from 'react-native';

import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { AppLockBoundary } from '../AppLockBoundary';
import { useAppLockStore } from '../app-lock.store';

/**
 * `AppLockBoundary` — thời gian khoá khi vào nền/quay lại, và ảnh app switcher.
 *
 * Mock `AppState` để điều khiển: `background` rồi `active` sau N giây (đồng hồ giả).
 */

jest.mock('expo-screen-capture', () => ({
  disableAppSwitcherProtectionAsync: jest.fn(async () => undefined),
  enableAppSwitcherProtectionAsync: jest.fn(async () => undefined),
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));

const enable = jest.mocked(ScreenCapture.enableAppSwitcherProtectionAsync);
const disable = jest.mocked(ScreenCapture.disableAppSwitcherProtectionAsync);

const BINDING = {
  credentialId: 'c1',
  email: 'a@b.com',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  kind: 'FINGERPRINT' as const,
  userId: 'u1',
};

let emitAppState: (state: 'active' | 'background' | 'inactive') => void = () => undefined;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    emitAppState = handler as typeof emitAppState;
    return { remove: jest.fn() } as never;
  });
  useAuthStore.getState().setAuth({ token: 'tok' });
  useBiometricStore.setState({ binding: BINDING, hasHydrated: true });
  useAppLockStore.getState().unlock();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function backgroundThenReturnAfter(seconds: number): Promise<void> {
  emitAppState('background');
  jest.advanceTimersByTime(seconds * 1000);
  emitAppState('active');
}

describe('thời gian khoá', () => {
  it('nền ≥ 5 phút rồi quay lại ⇒ khoá', async () => {
    await renderHook(() => AppLockBoundary());

    await backgroundThenReturnAfter(301);

    expect(useAppLockStore.getState().locked).toBe(true);
  });

  it('nền < 5 phút ⇒ KHÔNG khoá', async () => {
    await renderHook(() => AppLockBoundary());

    await backgroundThenReturnAfter(60);

    expect(useAppLockStore.getState().locked).toBe(false);
  });

  it('`inactive` (hộp Face ID của iOS) KHÔNG tính là rời app', async () => {
    await renderHook(() => AppLockBoundary());

    emitAppState('inactive');
    jest.advanceTimersByTime(600_000);
    emitAppState('active');

    expect(useAppLockStore.getState().locked).toBe(false);
  });

  it('ĐÃ ĐĂNG XUẤT (còn gắn kết sinh trắc) ⇒ KHÔNG đè lớp phủ khoá lên màn Đăng nhập', async () => {
    useAuthStore.getState().clearAuth();
    await renderHook(() => AppLockBoundary());

    await backgroundThenReturnAfter(3600);

    expect(useAppLockStore.getState().locked).toBe(false);
  });

  it('đăng xuất giữa lúc đang khoá ⇒ gỡ khoá (không để lớp phủ đè màn Đăng nhập)', async () => {
    await renderHook(() => AppLockBoundary());
    await backgroundThenReturnAfter(301);
    expect(useAppLockStore.getState().locked).toBe(true);

    await act(async () => {
      useAuthStore.getState().clearAuth();
    });

    expect(useAppLockStore.getState().locked).toBe(false);
  });
});

describe('app switcher', () => {
  it('iOS + có phiên + đã gắn sinh trắc + khoá bật ⇒ làm mờ; gỡ khi unmount', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');

    const { unmount } = await renderHook(() => AppLockBoundary());
    expect(enable).toHaveBeenCalledWith(1);

    await unmount();
    expect(disable).toHaveBeenCalled();
  });

  it('iOS nhưng CHƯA đăng nhập ⇒ không làm mờ (màn Đăng nhập không có gì cần giấu)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    useAuthStore.getState().clearAuth();

    await renderHook(() => AppLockBoundary());

    expect(enable).not.toHaveBeenCalled();
  });

  it('iOS nhưng chưa gắn sinh trắc học ⇒ không làm mờ', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    useBiometricStore.setState({ binding: null, hasHydrated: true });

    await renderHook(() => AppLockBoundary());

    expect(enable).not.toHaveBeenCalled();
  });

  it('Android ⇒ không gọi gì (cần FLAG_SECURE — chặn cả chụp màn hình, chưa bật)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    await renderHook(() => AppLockBoundary());

    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });
});
