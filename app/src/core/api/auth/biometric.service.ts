import { apiClient } from '../client';
import { unwrapData } from '../unwrap';
import { AUTH_ENDPOINTS, biometricCredentialPath } from './auth.api';
import { normalize, persistSession } from './auth.session-helpers';
import type {
  BiometricCredentialItem,
  BiometricEnrollPayload,
  BiometricEnrollResponse,
  BiometricLoginPayload,
  BiometricSelfRevokeReason,
  LoginResponse,
  NormalizedSession,
} from './auth.types';

/**
 * Bốn thao tác API của đăng nhập sinh trắc học — tách khỏi `auth.service.ts`
 * để giữ file đó dưới trần 150 dòng, và vì bốn hàm này tự thành một nhóm mạch
 * lạc (`app.md` §2: "biometricLogin/enrollBiometric/listBiometricCredentials/
 * revokeBiometricCredential") không chia sẻ gì với luồng mật khẩu ngoài hai
 * hàm chuẩn hoá ở `auth.session-helpers.ts`.
 *
 * `auth.service.ts` gộp object này vào `authService` bằng spread, nên nơi gọi
 * (`authService.biometricLogin(...)`) không thấy khác biệt gì so với trước khi
 * tách file.
 */
export const biometricAuthService = {
  /**
   * Đăng nhập bằng sinh trắc học — PASSTHROUGH THUẦN TUÝ.
   *
   * ⛔ Hàm này KHÔNG đọc kho khoá, KHÔNG tính `hmac`, KHÔNG tự lấy nonce — nó
   * chỉ gửi ĐÚNG payload đã nhận (đã có sẵn `nonce` + `hmac` do
   * `useBiometricLogin` chuẩn bị) và chuẩn hoá phản hồi, y hệt `login()`.
   * Tách bạch để tầng service không bao giờ "nhìn thấy" bí mật thô — thứ đó chỉ
   * sống trong bộ nhớ cục bộ của hook, xem `features/auth/hooks/useBiometricLogin.ts`.
   */
  async biometricLogin(payload: BiometricLoginPayload): Promise<NormalizedSession> {
    const response = await apiClient.post<LoginResponse>(
      AUTH_ENDPOINTS.BIOMETRIC_LOGIN,
      payload,
      { skipAuthRefresh: true, skipErrorToast: true },
    );

    const session = normalize(unwrapData<LoginResponse>(response));
    await persistSession(session);
    return session;
  },

  /**
   * Bật đăng nhập sinh trắc học — endpoint RIÊNG, không sinh phiên đăng nhập
   * mới (khác cách `vci-sun-mobile` gọi lại `login()` rồi thu hồi token thừa).
   *
   * ⛔ KHÔNG có `skipAuthRefresh`: đây là lượt gọi của một người dùng ĐÃ đăng
   * nhập (đang ở màn Cài đặt), 401 ở đây là phiên thật sự đã chết và phải đi
   * qua đường làm mới token bình thường.
   */
  async enrollBiometric(payload: BiometricEnrollPayload): Promise<BiometricEnrollResponse> {
    const response = await apiClient.post<BiometricEnrollResponse>(
      AUTH_ENDPOINTS.BIOMETRIC_ENROLL,
      payload,
      { skipErrorToast: true },
    );
    return unwrapData<BiometricEnrollResponse>(response);
  },

  /** "Thiết bị tin cậy" (P1) — chỉ credential ACTIVE của chính người gọi. */
  async listBiometricCredentials(): Promise<BiometricCredentialItem[]> {
    const response = await apiClient.get<BiometricCredentialItem[]>(
      AUTH_ENDPOINTS.BIOMETRIC_CREDENTIALS,
    );
    return unwrapData<BiometricCredentialItem[]>(response);
  },

  /**
   * Thu hồi MỘT credential sinh trắc của chính mình — dùng khi tắt công tắc,
   * đổi tài khoản trên cùng máy, hoặc dọn cục bộ sau khi phát hiện bí mật đã vô
   * hiệu/hết hạn/bị BE thu hồi.
   *
   * ⛔ `reason` chỉ nhận hai giá trị BE cho phép ở lượt tự thu hồi
   * (`BiometricSelfRevokeReason`) — các lý do khác (hết hạn, vô hiệu cục bộ…)
   * gọi hàm này KHÔNG kèm `reason`, BE tự ghi nhận theo trạng thái đã biết.
   *
   * Endpoint idempotent (đã REVOKED vẫn trả `200`) nên nơi gọi (`disableBiometric`)
   * coi lỗi mạng là chuyện BEST-EFFORT — xem chú thích ở đó.
   */
  async revokeBiometricCredential(
    credentialId: string,
    reason?: BiometricSelfRevokeReason,
  ): Promise<void> {
    await apiClient.delete(biometricCredentialPath(credentialId), {
      params: reason ? { reason } : undefined,
      skipErrorToast: true,
    });
  },
};
