import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  getFcmToken,
  registerPushToken,
  registerRotatedToken,
  resetPushRegistration,
  unregisterThisDevice,
} from '../device-registration';
import { devicesService } from '../devices.service';

/**
 * `app.md` §8: token refresh đăng ký lại; logout gọi DELETE (không ném lỗi). Phần "chỉ đăng ký khi granted"
 * nằm ở `device-registration.test.ts`.
 */

jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(async () => 'device-abc-123') }));
jest.mock('../devices.service', () => ({
  devicesService: { list: jest.fn(), register: jest.fn(), remove: jest.fn() },
}));

const mockedRegister = jest.mocked(devicesService.register);
const mockedRemove = jest.mocked(devicesService.remove);
const mockedGetToken = jest.mocked(Notifications.getDevicePushTokenAsync);

const GRANTED = { canAskAgain: true, expires: 'never', granted: true, status: 'granted' } as never;
const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  resetPushRegistration();
  Platform.OS = 'android';
  mockedRegister.mockResolvedValue({
    deviceId: 'device-abc-123',
    id: 'row-1',
    kind: 'FCM',
    platform: 'ANDROID',
  });
  mockedRemove.mockResolvedValue({ revoked: 1 });
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(GRANTED);
  mockedGetToken.mockResolvedValue({ data: 'fcm-token-aaaaaaaaaaaaaaaa', type: 'android' });
});

afterAll(() => {
  Platform.OS = originalOS;
});

describe('registerRotatedToken', () => {
  it('token xoay → đăng ký token MỚI ngay, không cần quyền được đọc lại', async () => {
    await registerPushToken('user-1');
    await expect(registerRotatedToken('user-1', 'fcm-token-rotated-bbbbbbbb')).resolves.toBe(
      'registered',
    );

    expect(mockedRegister).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: 'fcm-token-rotated-bbbbbbbb' }),
    );
  });

  it('iOS: bỏ qua', async () => {
    Platform.OS = 'ios';
    await expect(registerRotatedToken('user-1', 'apns-hex-token-0123456789')).resolves.toBe(
      'unsupported-platform',
    );
    expect(mockedRegister).not.toHaveBeenCalled();
  });
});

describe('getFcmToken', () => {
  it('trả null khi token không phải loại android', async () => {
    mockedGetToken.mockResolvedValueOnce({ data: 'apns-hex', type: 'ios' });
    await expect(getFcmToken()).resolves.toBeNull();
  });
});

describe('unregisterThisDevice', () => {
  it('DELETE đúng deviceId, chế độ im lặng + có trần thời gian', async () => {
    await expect(unregisterThisDevice()).resolves.toBe(true);

    expect(mockedRemove).toHaveBeenCalledWith('device-abc-123', {
      silent: true,
      timeoutMs: expect.any(Number),
    });
  });

  it('lỗi mạng KHÔNG ném — đăng xuất không được kẹt (BE cũng tự gỡ theo X-Device-Id)', async () => {
    mockedRemove.mockRejectedValueOnce(new Error('timeout'));
    await expect(unregisterThisDevice()).resolves.toBe(false);
  });

  it('sau khi gỡ, lần đăng nhập kế phải POST lại dù cùng user + token', async () => {
    await registerPushToken('user-1');
    await unregisterThisDevice();

    await expect(registerPushToken('user-1')).resolves.toBe('registered');
    expect(mockedRegister).toHaveBeenCalledTimes(2);
  });
});
