import { apiClient } from '../client';
import { unwrapData } from '../unwrap';
import { AUTH_ENDPOINTS } from './auth.api';
import type {
  AccountDeletionCancelPayload,
  AccountDeletionCancelResponse,
  AccountDeletionRequestPayload,
  AccountDeletionStatus,
  PrivacySettings,
  UpdatePhoneResult,
  UpdatePrivacyPayload,
} from './auth.types';

/**
 * "Xoá tài khoản (ân hạn)" và "Quyền riêng tư" (p0-01 mục 10, phần còn lại,
 * mở từ `me/settings`) — tách khỏi `auth.service.ts` để giữ file đó dưới trần
 * 150 dòng, cùng lối tách với `session.service.ts`/`biometric.service.ts`
 * ngay cạnh đây. Gộp CHUNG một file (thay vì hai) vì cả ba hàm đều thuộc
 * nhóm endpoint `/me/*` và tổng cộng vẫn nhỏ.
 *
 * `auth.service.ts` gộp object này vào `authService` bằng spread, nên nơi gọi
 * (`authService.requestAccountDeletion(...)`) không thấy khác biệt gì.
 */
export const accountAuthService = {
  /**
   * Yêu cầu xoá tài khoản — CẦN access token, khác `cancelAccountDeletion`.
   *
   * ⛔ `skipErrorToast`: sai mật khẩu (`AUTH_001`) phải hiện NGAY TRONG form
   * xác nhận của màn "Xoá tài khoản", không phải toast tự tắt sau 4 giây —
   * cùng luật với mọi ô xác nhận mật khẩu khác trong app (`AppUnlockForm`,
   * `BiometricEnrollSheet`).
   */
  async requestAccountDeletion(
    payload: AccountDeletionRequestPayload,
  ): Promise<AccountDeletionStatus> {
    const response = await apiClient.post<AccountDeletionStatus>(
      AUTH_ENDPOINTS.DELETE_REQUEST,
      payload,
      { skipErrorToast: true },
    );
    return unwrapData<AccountDeletionStatus>(response);
  },

  /**
   * Huỷ yêu cầu xoá.
   *
   * ⛔ KHÔNG dùng được access token hiện có: tài khoản `PENDING_DELETION` bị BE
   * chặn đăng nhập/làm mới token bình thường, nên lượt này gọi TRẦN như
   * `login()`/`resetPassword()` — `skipAuthRefresh` bắt buộc, nếu không 400/401
   * ở đây bị interceptor hiểu nhầm thành "phiên hết hạn" và đi làm mới token
   * cho một lượt vốn chưa từng cần token. `skipErrorToast`: sai email/mật khẩu
   * hay hết hạn ân hạn (`USER_011`) phải hiện trong form, không phải toast.
   */
  async cancelAccountDeletion(
    payload: AccountDeletionCancelPayload,
  ): Promise<AccountDeletionCancelResponse> {
    const response = await apiClient.post<AccountDeletionCancelResponse>(
      AUTH_ENDPOINTS.DELETE_CANCEL,
      payload,
      { skipAuthRefresh: true, skipErrorToast: true },
    );
    return unwrapData<AccountDeletionCancelResponse>(response);
  },

  /** Đổi cài đặt quyền riêng tư — BE đòi ít nhất một field trong `payload`. */
  async updatePrivacy(payload: UpdatePrivacyPayload): Promise<PrivacySettings> {
    const response = await apiClient.patch<PrivacySettings>(AUTH_ENDPOINTS.PRIVACY, payload);
    return unwrapData<PrivacySettings>(response);
  },

  /**
   * Đặt/đổi/xoá (`phone = null`) SĐT TỰ KHAI của chính mình — `PATCH /me/phone` (`updatePhoneSchema`, `.strict()`).
   *
   * BE chuẩn hoá E.164 và từ chối hình dạng sai bằng 400 `VAL_001`; app đã chặn trước bằng `normalizePhone` (đồng bộ với BE
   * — `shared/utils/phone.utils.ts`) nên nơi gọi nên truyền số đã chuẩn hoá. Số này CHƯA xác minh (chưa có OTP/SMS): chỉ để
   * người khác tra khớp chính xác khi thêm vào nhóm, và tuỳ cờ riêng tư `findableByPhone` của chính người dùng.
   *
   * ⛔ `skipErrorToast`: lỗi (429 `RATE_002` của `accountActionLimiter`, 400…) hiện NGAY TRONG form "Sửa hồ sơ" — toast tự
   * tắt sau 4 giây trong lúc người dùng còn đang sửa số.
   */
  async updatePhone(phone: string | null): Promise<UpdatePhoneResult> {
    const response = await apiClient.patch<UpdatePhoneResult>(
      AUTH_ENDPOINTS.PHONE,
      { phone },
      { skipErrorToast: true },
    );
    const result = unwrapData<Partial<UpdatePhoneResult> | null>(response);
    return { phone: typeof result?.phone === 'string' ? result.phone : null };
  },
};
