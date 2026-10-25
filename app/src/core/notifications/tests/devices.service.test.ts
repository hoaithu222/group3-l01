import { apiClient } from '@/core/api/client';

import { devicePath } from '../devices.api';
import { devicesService } from '../devices.service';

/**
 * Hợp đồng `/me/devices` với BE (`be/src/modules/devices/devices.routes.ts`): POST body + cờ, DELETE theo
 * `deviceId`, và cờ `silent` của lượt gỡ lúc đăng xuất.
 */

jest.mock('@/core/api/client', () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), post: jest.fn() },
}));

const mockedPost = jest.mocked(apiClient.post);
const mockedGet = jest.mocked(apiClient.get);
const mockedDelete = jest.mocked(apiClient.delete);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('devicesService', () => {
  it('register: POST /me/devices, tắt toast (việc nền), bóc lớp bọc { data }', async () => {
    mockedPost.mockResolvedValueOnce({
      data: { data: { deviceId: 'd1', id: 'row', kind: 'FCM', platform: 'ANDROID' } },
    });
    const payload = {
      deviceId: 'device-abc-123',
      kind: 'FCM',
      platform: 'ANDROID',
      token: 'fcm-token-aaaaaaaaaaaaaaaa',
    } as const;

    await expect(devicesService.register(payload)).resolves.toEqual({
      deviceId: 'd1',
      id: 'row',
      kind: 'FCM',
      platform: 'ANDROID',
    });
    expect(mockedPost).toHaveBeenCalledWith('/me/devices', payload, { skipErrorToast: true });
  });

  it('list: GET /me/devices', async () => {
    mockedGet.mockResolvedValueOnce({ data: { data: [] } });
    await expect(devicesService.list()).resolves.toEqual([]);
    expect(mockedGet).toHaveBeenCalledWith('/me/devices');
  });

  it('remove (thường): DELETE /me/devices/:id — để interceptor toast lỗi', async () => {
    mockedDelete.mockResolvedValueOnce({ data: { data: { revoked: 1 } } });
    await expect(devicesService.remove('device-abc-123')).resolves.toEqual({ revoked: 1 });
    expect(mockedDelete).toHaveBeenCalledWith('/me/devices/device-abc-123', {});
  });

  it('remove (silent): không toast, không làm mới token khi 401, có timeout', async () => {
    mockedDelete.mockResolvedValueOnce({ data: { data: { revoked: 0 } } });
    await devicesService.remove('device-abc-123', { silent: true, timeoutMs: 4000 });
    expect(mockedDelete).toHaveBeenCalledWith('/me/devices/device-abc-123', {
      skipAuthRefresh: true,
      skipErrorToast: true,
      timeout: 4000,
    });
  });

  it('devicePath mã hoá deviceId — id lạ không phá đường dẫn', () => {
    expect(devicePath('a/b c')).toBe('/me/devices/a%2Fb%20c');
  });
});
