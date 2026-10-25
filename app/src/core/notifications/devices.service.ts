import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { DEVICE_ENDPOINTS, devicePath } from './devices.api';
import type {
  DeviceSummary,
  RegisterDevicePayload,
  RegisterDeviceResult,
  UnregisterDeviceResult,
} from './devices.types';

/**
 * Tầng gọi API thiết bị nhận push (p0-06). Không biết gì về expo-notifications —
 * `device-registration.ts` là nơi nối token với các lời gọi này.
 */
export const devicesService = {
  /**
   * Đăng ký/cập nhật token — `POST /me/devices`.
   *
   * ⛔ `skipErrorToast`: đây là việc NỀN, người dùng không bấm gì. Toast "Không đăng ký được
   * thiết bị" mỗi lần mở app lúc mất mạng chỉ gây hoảng; lỗi được nơi gọi ghi log và thử lại
   * ở lần kích hoạt kế tiếp (`usePushRegistration`).
   */
  async register(payload: RegisterDevicePayload): Promise<RegisterDeviceResult> {
    const response = await apiClient.post<RegisterDeviceResult>(DEVICE_ENDPOINTS.ROOT, payload, {
      skipErrorToast: true,
    });
    return unwrapData<RegisterDeviceResult>(response);
  },

  /** Danh sách thiết bị đang hoạt động của chính mình — `GET /me/devices`. */
  async list(): Promise<DeviceSummary[]> {
    const response = await apiClient.get<DeviceSummary[]>(DEVICE_ENDPOINTS.ROOT);
    return unwrapData<DeviceSummary[]>(response);
  },

  /**
   * Gỡ thiết bị — `DELETE /me/devices/:deviceId`.
   *
   * `silent` (đăng xuất): không toast, không làm mới token khi 401, và có trần thời gian —
   * người dùng bấm "Đăng xuất" thường vì sắp đưa máy cho người khác, không được để một cú
   * mạng chậm giữ họ lại. ⚠️ Khi `silent` thì lỗi vẫn ném ra (nơi gọi tự nuốt) — `authService.logout()`
   * theo cùng mẫu, và BE cũng tự gỡ theo `X-Device-Id` lúc `POST /auth/logout`.
   */
  async remove(
    deviceId: string,
    options: { silent?: boolean; timeoutMs?: number } = {},
  ): Promise<UnregisterDeviceResult> {
    const response = await apiClient.delete<UnregisterDeviceResult>(devicePath(deviceId), {
      ...(options.silent ? { skipAuthRefresh: true, skipErrorToast: true } : {}),
      ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
    });
    return unwrapData<UnregisterDeviceResult>(response);
  },
};
