import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { act } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { registerPushToken, registerRotatedToken } from '@/core/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

import { usePushRegistration } from '../usePushRegistration';

/**
 * `app.md` §8: chỉ đăng ký khi đã đăng nhập; token refresh đăng ký lại. (Điều kiện "chỉ khi granted" nằm ở
 * `registerPushToken` — test ở `core/notifications/tests/device-registration.test.ts`.)
 */

jest.mock('@/core/notifications', () => ({
  registerPushToken: jest.fn(async () => 'registered'),
  registerRotatedToken: jest.fn(async () => 'registered'),
}));

const mockedRegister = jest.mocked(registerPushToken);
const mockedRotated = jest.mocked(registerRotatedToken);
const mockedTokenListener = jest.mocked(Notifications.addPushTokenListener);

function signIn(userId = 'u-1') {
  useAuthStore.setState({ status: 'authenticated', token: 'jwt', user: { id: userId } as never });
}

let appStateCallback: ((state: AppStateStatus) => void) | null = null;
const appStateRemove = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  appStateCallback = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    callback: (state: AppStateStatus) => void,
  ) => {
    appStateCallback = callback;
    return { remove: appStateRemove };
  }) as never);
  useAuthStore.setState({ status: 'anonymous', token: null, user: null });
});

afterEach(() => {
  jest.mocked(AppState.addEventListener).mockRestore();
});

describe('usePushRegistration', () => {
  it('đã đăng nhập → đăng ký token cho đúng user', async () => {
    signIn('u-7');
    await renderHook(() => usePushRegistration());
    expect(mockedRegister).toHaveBeenCalledWith('u-7');
  });

  it('chưa đăng nhập / đang khôi phục phiên → không đăng ký, không nghe sự kiện nào', async () => {
    for (const status of ['idle', 'restoring', 'anonymous'] as const) {
      useAuthStore.setState({ status, token: null, user: null });
      const view = await renderHook(() => usePushRegistration());
      // Gỡ trước vòng kế: hook còn gắn thì `setState` ở vòng sau cập nhật ngoài `act`.
      await view.unmount();
    }
    expect(mockedRegister).not.toHaveBeenCalled();
    expect(mockedTokenListener).not.toHaveBeenCalled();
  });

  it('đã authenticated nhưng chưa có user.id → chờ (không đăng ký cho user "undefined")', async () => {
    useAuthStore.setState({ status: 'authenticated', token: 'jwt', user: null });
    await renderHook(() => usePushRegistration());
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('app quay lại active → đăng ký lại (người dùng vừa bật quyền trong Cài đặt hệ thống)', async () => {
    signIn();
    await renderHook(() => usePushRegistration());
    mockedRegister.mockClear();

    await act(async () => appStateCallback?.('background'));
    expect(mockedRegister).not.toHaveBeenCalled();

    await act(async () => appStateCallback?.('active'));
    expect(mockedRegister).toHaveBeenCalledWith('u-1');
  });

  it('Firebase xoay token → đăng ký token MỚI', async () => {
    signIn();
    await renderHook(() => usePushRegistration());

    const listener = mockedTokenListener.mock.calls[0]?.[0];
    await act(async () => listener?.({ data: 'fcm-token-rotated-bbbbbbbb', type: 'android' }));

    expect(mockedRotated).toHaveBeenCalledWith('u-1', 'fcm-token-rotated-bbbbbbbb');
  });

  it('token loại khác (APNs) → bỏ qua, không đăng ký như FCM', async () => {
    signIn();
    await renderHook(() => usePushRegistration());

    const listener = mockedTokenListener.mock.calls[0]?.[0];
    await act(async () => listener?.({ data: 'apns-hex', type: 'ios' }));

    expect(mockedRotated).not.toHaveBeenCalled();
  });

  it('gỡ hook → huỷ đăng ký cả hai listener', async () => {
    signIn();
    const removeToken = jest.fn();
    mockedTokenListener.mockReturnValueOnce({ remove: removeToken } as never);

    const view = await renderHook(() => usePushRegistration());
    await view.unmount();

    expect(removeToken).toHaveBeenCalled();
    expect(appStateRemove).toHaveBeenCalled();
  });
});
