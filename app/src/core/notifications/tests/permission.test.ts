import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import {
  getPushPermission,
  openNotificationSettings,
  requestPushPermission,
  toPermissionState,
} from '../permission';

/**
 * PUSH-11: từ chối quyền → inbox + socket vẫn chạy, KHÔNG hỏi lại liên tục. Nên `requestPushPermission`
 * chỉ hiện hộp thoại khi thực sự còn `undetermined`.
 */

const mockedGet = jest.mocked(Notifications.getPermissionsAsync);
const mockedRequest = jest.mocked(Notifications.requestPermissionsAsync);
const mockedChannel = jest.mocked(Notifications.setNotificationChannelAsync);

function permission(overrides: Record<string, unknown>) {
  return {
    canAskAgain: true,
    expires: 'never',
    granted: false,
    status: 'undetermined',
    ...overrides,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('toPermissionState', () => {
  it.each([
    ['đã cấp', { granted: true }, 'granted'],
    ['chưa hỏi lần nào (Android)', { canAskAgain: true, granted: false }, 'undetermined'],
    ['từ chối vĩnh viễn (canAskAgain=false)', { canAskAgain: false, granted: false }, 'denied'],
    ['iOS đã từ chối', { canAskAgain: true, granted: false, ios: { status: 1 } }, 'denied'],
    ['iOS chưa hỏi', { canAskAgain: true, granted: false, ios: { status: 0 } }, 'undetermined'],
    [
      'iOS provisional vẫn hiện thông báo',
      { canAskAgain: false, granted: false, ios: { status: 3 } },
      'granted',
    ],
    ['iOS ephemeral', { canAskAgain: false, granted: false, ios: { status: 4 } }, 'granted'],
  ] as [string, { canAskAgain?: boolean; granted?: boolean; ios?: { status: number } }, string][])(
    '%s',
    (_name, input, expected) => {
      expect(
        toPermissionState({
          canAskAgain: input.canAskAgain ?? true,
          granted: input.granted ?? false,
          ios: input.ios,
        }),
      ).toBe(expected);
    },
  );
});

describe('getPushPermission', () => {
  it('đọc lỗi (module native hỏng) ≠ đã từ chối — coi như chưa hỏi', async () => {
    mockedGet.mockRejectedValueOnce(new Error('native'));
    await expect(getPushPermission()).resolves.toBe('undetermined');
  });
});

describe('requestPushPermission', () => {
  it('còn undetermined → tạo kênh RỒI hiện hộp thoại (Android 13+ cần kênh trước)', async () => {
    mockedGet.mockResolvedValueOnce(permission({}));
    mockedRequest.mockResolvedValueOnce(permission({ granted: true, status: 'granted' }));

    // Kênh chỉ tạo trên Android; ép Platform cho ca này.
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      await expect(requestPushPermission()).resolves.toBe('granted');
    } finally {
      Platform.OS = original;
    }

    expect(mockedChannel).toHaveBeenCalled();
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    const channelOrder = mockedChannel.mock.invocationCallOrder[0] ?? Infinity;
    const requestOrder = mockedRequest.mock.invocationCallOrder[0] ?? -1;
    expect(channelOrder).toBeLessThan(requestOrder);
  });

  it('đã denied → KHÔNG gọi hộp thoại (hỏi lại chỉ trả denied ngay, người dùng tưởng app treo)', async () => {
    mockedGet.mockResolvedValueOnce(permission({ canAskAgain: false }));
    await expect(requestPushPermission()).resolves.toBe('denied');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('đã granted → không hỏi lại', async () => {
    mockedGet.mockResolvedValueOnce(permission({ granted: true }));
    await expect(requestPushPermission()).resolves.toBe('granted');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('người dùng từ chối ở hộp thoại → denied', async () => {
    mockedGet.mockResolvedValueOnce(permission({}));
    mockedRequest.mockResolvedValueOnce(permission({ canAskAgain: false, status: 'denied' }));
    await expect(requestPushPermission()).resolves.toBe('denied');
  });
});

describe('openNotificationSettings', () => {
  it('mở Cài đặt hệ thống; trả false khi không mở được', async () => {
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValueOnce(undefined);
    await expect(openNotificationSettings()).resolves.toBe(true);

    spy.mockRejectedValueOnce(new Error('no'));
    await expect(openNotificationSettings()).resolves.toBe(false);
    spy.mockRestore();
  });
});
