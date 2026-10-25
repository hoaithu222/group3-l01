import { PermissionsAndroid, Platform } from 'react-native';

import {
  ensureBluetoothAudioPermission,
  resetBluetoothPermissionForTests,
} from '../bluetooth-permission';

/**
 * Quyền "Thiết bị ở gần" (`BLUETOOTH_CONNECT`, Android 12+) để LiveKit định tuyến tiếng qua tai nghe Bluetooth — xin lúc vào phòng, hỏi tối
 * đa một lần mỗi lần mở app, KHÔNG bao giờ chặn việc vào phòng (không ném).
 */
function onAndroid(version: number): void {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version as never);
}

beforeEach(() => {
  jest.restoreAllMocks();
  resetBluetoothPermissionForTests();
});

describe('ensureBluetoothAudioPermission', () => {
  it('iOS và Android ≤ 11: không cần quyền này, không hỏi', async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request');
    await expect(ensureBluetoothAudioPermission()).resolves.toBe(true);

    onAndroid(30);
    await expect(ensureBluetoothAudioPermission()).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('Android 12+ đã có quyền: không hỏi lại', async () => {
    onAndroid(33);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    const request = jest.spyOn(PermissionsAndroid, 'request');

    await expect(ensureBluetoothAudioPermission()).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('Android 12+ chưa có quyền: hỏi đúng BLUETOOTH_CONNECT, MỘT lần mỗi lần mở app; từ chối thì trả false', async () => {
    onAndroid(34);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

    await expect(ensureBluetoothAudioPermission()).resolves.toBe(false);
    await expect(ensureBluetoothAudioPermission()).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  });

  it('module quyền lỗi (thiếu native): nuốt lỗi, trả false — việc vào phòng không bị chặn', async () => {
    onAndroid(31);
    jest.spyOn(PermissionsAndroid, 'check').mockRejectedValue(new Error('native'));
    await expect(ensureBluetoothAudioPermission()).resolves.toBe(false);
  });
});
