import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, resetPushRegistration } from '../device-registration';
import { devicesService } from '../devices.service';

/**
 * `app.md` §8: chỉ đăng ký khi `granted`. Token xoay + gỡ khi đăng xuất: `device-unregistration.test.ts`.
 * Chạy với Platform = android — iOS chưa có token FCM (xem chú thích đầu `device-registration.ts`).
 */

jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(async () => 'device-abc-123') }));
jest.mock('../devices.service', () => ({
  devicesService: { list: jest.fn(), register: jest.fn(), remove: jest.fn() },
}));

const mockedRegister = jest.mocked(devicesService.register);
const mockedGetPermissions = jest.mocked(Notifications.getPermissionsAsync);
const mockedGetToken = jest.mocked(Notifications.getDevicePushTokenAsync);

const GRANTED = { canAskAgain: true, expires: 'never', granted: true, status: 'granted' } as never;
const DENIED = { canAskAgain: false, expires: 'never', granted: false, status: 'denied' } as never;

const originalOS = Platform.OS;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  // Các nhánh lỗi cố ý ghi `console.warn` ở __DEV__ — giữ log test sạch.
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  resetPushRegistration();
  Platform.OS = 'android';
  mockedRegister.mockResolvedValue({
    deviceId: 'device-abc-123',
    id: 'row-1',
    kind: 'FCM',
    platform: 'ANDROID',
  });
  mockedGetPermissions.mockResolvedValue(GRANTED);
  mockedGetToken.mockResolvedValue({ data: 'fcm-token-aaaaaaaaaaaaaaaa', type: 'android' });
});

afterEach(() => {
  warnSpy.mockRestore();
});

afterAll(() => {
  Platform.OS = originalOS;
});

describe('registerPushToken', () => {
  it('quyền granted → POST /me/devices đúng hợp đồng BE (deviceId, ANDROID, FCM, token)', async () => {
    await expect(registerPushToken('user-1')).resolves.toBe('registered');

    expect(mockedRegister).toHaveBeenCalledTimes(1);
    expect(mockedRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'device-abc-123',
        kind: 'FCM',
        platform: 'ANDROID',
        token: 'fcm-token-aaaaaaaaaaaaaaaa',
      }),
    );
  });

  it('PUSH-11: quyền bị từ chối → KHÔNG lấy token, KHÔNG gọi BE', async () => {
    mockedGetPermissions.mockResolvedValue(DENIED);

    await expect(registerPushToken('user-1')).resolves.toBe('no-permission');
    expect(mockedGetToken).not.toHaveBeenCalled();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('chưa hỏi quyền → cũng không đăng ký (không tự xin quyền)', async () => {
    mockedGetPermissions.mockResolvedValue({
      canAskAgain: true,
      expires: 'never',
      granted: false,
      status: 'undetermined',
    } as never);

    await expect(registerPushToken('user-1')).resolves.toBe('no-permission');
    expect(mockedRegister).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('gọi lại cùng user + cùng token → không POST lần hai', async () => {
    await registerPushToken('user-1');
    await expect(registerPushToken('user-1')).resolves.toBe('already-registered');
    expect(mockedRegister).toHaveBeenCalledTimes(1);
  });

  it('đổi tài khoản trên cùng máy (cùng token, user khác) → POST lại để BE chuyển userId (NT-07)', async () => {
    await registerPushToken('user-1');
    await expect(registerPushToken('user-2')).resolves.toBe('registered');
    expect(mockedRegister).toHaveBeenCalledTimes(2);
  });

  it('single-flight: hai lượt kích hoạt đồng thời chỉ sinh một request', async () => {
    const [first, second] = await Promise.all([registerPushToken('user-1'), registerPushToken('user-1')]);
    expect(first).toBe('registered');
    expect(second).toBe('registered');
    expect(mockedRegister).toHaveBeenCalledTimes(1);
  });

  it('BE lỗi (mất mạng) → failed, KHÔNG đánh dấu đã đăng ký — lần sau thử lại', async () => {
    mockedRegister.mockRejectedValueOnce(new Error('Network Error'));
    await expect(registerPushToken('user-1')).resolves.toBe('failed');

    await expect(registerPushToken('user-1')).resolves.toBe('registered');
    expect(mockedRegister).toHaveBeenCalledTimes(2);
  });

  it('không lấy được token FCM (thiếu google-services.json) → no-token, không gọi BE', async () => {
    mockedGetToken.mockRejectedValueOnce(new Error('Default FirebaseApp is not initialized'));
    await expect(registerPushToken('user-1')).resolves.toBe('no-token');
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('iOS: bỏ qua — token APNs thô không dùng được với FCM, đăng ký chỉ làm BE thu hồi', async () => {
    Platform.OS = 'ios';
    await expect(registerPushToken('user-1')).resolves.toBe('unsupported-platform');
    expect(mockedGetToken).not.toHaveBeenCalled();
    expect(mockedRegister).not.toHaveBeenCalled();
  });
});
