import { isAxiosError } from 'axios';
import * as Device from 'expo-device';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import { getBiometricCapability, saveSecret } from '@/core/auth/biometric';
import { authService } from '@/core/api/auth';
import { toAuthErrorMessage, UserFacingError } from '@/core/api/auth/auth-errors';
import { getDeviceId } from '@/core/device/device-id';
import type { AuthUser } from '@/shell/store/slices/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import {
  biometricEnableConfirmPrompt,
  biometricEnrollCancelledMessage,
  biometricEnrollFailedMessage,
  biometricUnusableGuidance,
} from '../constants/biometric.messages';

/**
 * Toàn bộ chuỗi BẬT tính năng — tách khỏi `useBiometricEnrollment.ts` để giữ
 * file đó dưới trần 150 dòng (`docs/rules/code-style.md`). Đây là phần nghiệp
 * vụ THUẦN (không React), nên tách ra còn giúp test được không cần render hook.
 */
export type EnrollOutcome =
  { ok: true } | { ok: false; kind: 'network' } | { ok: false; kind: 'message'; message: string };

/**
 * Câu lỗi cho người dùng. ⛔ Lỗi KHÔNG phải HTTP mà không do chính hàm này chủ ý ném là thông điệp THÔ
 * của kho khoá hệ điều hành ("User canceled the authentication", "Could not encrypt…") — tiếng Anh, tuỳ
 * nền tảng — nên chỉ đọc chữ `cancel` để phân biệt "người dùng huỷ" với "hỏng", KHÔNG hiện lại nguyên văn.
 */
function toEnrollMessage(error: unknown, label: string): string {
  if (isAxiosError(error)) return toAuthErrorMessage(error, 'confirmPassword');
  if (error instanceof UserFacingError) return error.message;
  const raw = error instanceof Error ? error.message.toLowerCase() : '';
  return raw.includes('cancel')
    ? biometricEnrollCancelledMessage(label)
    : biometricEnrollFailedMessage(label);
}

export async function performBiometricEnroll(
  user: AuthUser,
  password: string,
): Promise<EnrollOutcome> {
  let createdCredentialId: string | undefined;
  let label = 'sinh trắc học';

  try {
    const capability = await getBiometricCapability();
    label = capability.label;
    if (!capability.hasHardware || !capability.isUsable || !capability.kind) {
      // Không thể tới đây trong luồng bình thường — `BiometricSettingRow` đã
      // chặn ở tầng UI. Vẫn kiểm lại vì hàm này có thể được gọi trực tiếp
      // (test, hoặc một màn khác trong tương lai) mà bỏ qua bước UI đó.
      return { kind: 'message', message: biometricUnusableGuidance(capability.label), ok: false };
    }

    const deviceId = await getDeviceId();
    const platform: 'ANDROID' | 'IOS' = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

    const enrollResponse = await authService.enrollBiometric({
      biometryKind: capability.kind,
      deviceId,
      // `expo-device` là phần THÊM ngoài checklist gốc của `app.md` — đã cài
      // đúng như `app.md` §6 dự trù ("expo-device nếu p0-06 chưa cài (tên máy)").
      deviceName: Device.modelName ?? undefined,
      password,
      platform,
    });
    createdCredentialId = enrollResponse.credentialId;

    const prompt = biometricEnableConfirmPrompt(capability.label);

    /**
     * iOS: phải tự quét XÁC NHẬN trước khi ghi — `setItemAsync` với
     * `requireAuthentication` trên iOS chỉ tự hỏi lúc ĐỌC/SỬA một mục ĐÃ có,
     * không hỏi lúc TẠO MỚI. Android bỏ qua bước này — chính lệnh ghi
     * (`saveSecret` bên dưới) tự hiện hộp quét (`app.md` §2.1).
     */
    if (Platform.OS === 'ios') {
      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: true,
        promptMessage: prompt,
      });
      if (!result.success)
        throw new UserFacingError(biometricEnrollCancelledMessage(capability.label));
    }

    await saveSecret(enrollResponse.secret, prompt);

    useBiometricStore.getState().setBinding({
      credentialId: enrollResponse.credentialId,
      email: user.email,
      expiresAt: enrollResponse.expiresAt,
      kind: enrollResponse.biometryKind,
      userId: user.id,
    });

    return { ok: true };
  } catch (error) {
    // Enroll đã tạo credential phía BE nhưng quét/ghi cục bộ hỏng ⇒ dọn NGAY,
    // best-effort — không được để lại một credential ACTIVE mà máy không có
    // bí mật tương ứng (app.md §4: "Ghi local/quét thất bại ⇒ revokeBiometricCredential").
    if (createdCredentialId) {
      try {
        await authService.revokeBiometricCredential(createdCredentialId);
      } catch {
        // Bỏ qua — dọn phía app đã xong (chưa từng `saveSecret` thành công).
      }
    }

    if (isAxiosError(error) && !error.response) {
      // Mất mạng/timeout: KHÔNG có phản hồi để đọc mã lỗi — báo bằng toast
      // riêng, không phải lỗi field vì nó không liên quan gì tới mật khẩu.
      return { kind: 'network', ok: false };
    }
    return { kind: 'message', message: toEnrollMessage(error, label), ok: false };
  }
}
