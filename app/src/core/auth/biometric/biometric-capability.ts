import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { IconName } from '@/shared/ui/icon';

/**
 * Loại cảm biến — dùng chung giữa app (nhãn/icon) và BE (`biometryKind` trong
 * DTO enroll/login, `be.md` §3: `FACE | FINGERPRINT | IRIS | GENERIC`).
 */
export type BiometricKind = 'FACE' | 'FINGERPRINT' | 'GENERIC' | 'IRIS';

export interface BiometricCapability {
  /** Máy có cảm biến vật lý không — CHƯA nói lên việc dùng được hay không. */
  hasHardware: boolean;
  /**
   * Máy DÙNG ĐƯỢC để cất bí mật ràng sinh trắc.
   *
   * ⛔ Cố ý lấy từ `SecureStore.canUseBiometricAuthentication()`, KHÔNG phải
   * `LocalAuthentication.isEnrolledAsync()`. Android chỉ nhận sinh trắc MẠNH
   * (`BIOMETRIC_STRONG`) cho việc ràng khoá Keystore — mở khoá màn hình bằng
   * khuôn mặt kiểu yếu (ảnh 2D) vẫn báo "đã cài" ở `isEnrolledAsync()` nhưng
   * ghi bí mật ràng sinh trắc sẽ lỗi giữa chừng. `canUseBiometricAuthentication()`
   * là câu hỏi ĐÚNG: "cất được bí mật ràng sinh trắc trên máy này không".
   */
  isUsable: boolean;
  /** `null` khi máy không có cảm biến nào (`hasHardware === false`). */
  kind: BiometricKind | null;
  /** Tên hiển thị, đã ghép sẵn theo nền tảng — "Face ID", "vân tay"... */
  label: string;
  /** Icon tương ứng, lấy từ bộ `<Icon>` của repo (⛔ không tự vẽ SVG). */
  icon: IconName;
}

/**
 * Đường lui an toàn — dùng cho MỌI lỗi native không lường trước (Expo Go, bản
 * build thiếu module, máy quá cũ) và cho máy thật sự không có cảm biến.
 *
 * ⛔ Không render nút/hàng sinh trắc học nào dựa trên giá trị này — cả màn
 * Đăng nhập lẫn Cài đặt đều kiểm `hasHardware`/`isUsable` trước khi hiện UI.
 */
const NOT_SUPPORTED: BiometricCapability = {
  hasHardware: false,
  isUsable: false,
  kind: null,
  label: 'sinh trắc học',
  icon: 'lock',
};

/**
 * Suy ra loại cảm biến ưu tiên từ danh sách `AuthenticationType` hệ điều hành
 * báo. Máy có thể báo NHIỀU loại cùng lúc (`supportedAuthenticationTypesAsync`
 * trả mảng) — quy tắc ưu tiên khác nhau giữa hai nền tảng, theo `app.md` §2.2:
 *
 *   iOS     — một máy chỉ có MỘT cảm biến thật (Face ID HOẶC Touch ID), ưu
 *             tiên đọc theo thứ tự khuôn mặt → vân tay → mống mắt là an toàn.
 *   Android — máy có thể cài CẢ hai, và khi đó ưu tiên VÂN TAY: mở khoá khuôn
 *             mặt trên Android thường là loại mở khoá MỨC YẾU (ảnh 2D), kém
 *             tin cậy hơn vân tay (mức MẠNH) — chọn nhầm khuôn mặt làm nhãn
 *             chính dễ dẫn người dùng tới trải nghiệm `isUsable=false`.
 */
function resolveKind(types: LocalAuthentication.AuthenticationType[]): BiometricKind | null {
  const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const hasIris = types.includes(LocalAuthentication.AuthenticationType.IRIS);

  if (Platform.OS === 'ios') {
    if (hasFace) return 'FACE';
    if (hasFingerprint) return 'FINGERPRINT';
    if (hasIris) return 'IRIS';
    return types.length > 0 ? 'GENERIC' : null;
  }

  if (hasFingerprint) return 'FINGERPRINT';
  if (hasFace) return 'FACE';
  if (hasIris) return 'IRIS';
  return types.length > 0 ? 'GENERIC' : null;
}

/**
 * Tên hiển thị — câu ghép "Đăng nhập bằng {nhãn}" phải đọc xuôi với MỌI tên ở
 * đây (`biometric.messages.ts`), nên không tên nào được viết hoa cả cụm trừ
 * "Face ID"/"Touch ID" (đúng chính tả tên riêng của Apple).
 */
function resolveLabel(kind: BiometricKind | null): string {
  if (Platform.OS === 'ios') {
    if (kind === 'FACE') return 'Face ID';
    if (kind === 'FINGERPRINT') return 'Touch ID';
  }
  switch (kind) {
    case 'FINGERPRINT':
      return 'vân tay';
    case 'FACE':
      return 'khuôn mặt';
    case 'IRIS':
      return 'mống mắt';
    default:
      return 'sinh trắc học';
  }
}

/**
 * Icon theo loại cảm biến. Vân tay dùng `touchid` — icon vân tay trong khung quét, đã có trong bộ xuất từ Figma
 * (`assets/icons/system/touchid*.svg`, cùng nét với `faceid`); không cần file `finger-print.svg` riêng (đồng bộ chéo #14 của
 * kế hoạch, p0-12). Loại còn lại (mống mắt, không có cảm biến) rơi về `lock`.
 */
function resolveIcon(kind: BiometricKind | null): IconName {
  if (kind === 'FACE') return 'faceid';
  return kind === 'FINGERPRINT' ? 'touchid' : 'lock';
}

/**
 * Hỏi khả năng sinh trắc học của máy — ⛔ KHÔNG BAO GIỜ ném lỗi.
 *
 * Mọi lỗi native (chạy trong Expo Go, bản build thiếu module `expo-local-authentication`,
 * driver lạ trả về bất thường) đều quy về `NOT_SUPPORTED`. Để lỗi bay lên là
 * làm VỠ màn Đăng nhập vì một dòng máy hiếm gặp — đổi lại, người dùng máy đó
 * chỉ đơn giản không thấy nút sinh trắc học, vẫn đăng nhập được bằng mật khẩu.
 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return NOT_SUPPORTED;

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const kind = resolveKind(types);
    const isUsable = SecureStore.canUseBiometricAuthentication();

    return {
      hasHardware,
      isUsable,
      kind,
      label: resolveLabel(kind),
      icon: resolveIcon(kind),
    };
  } catch {
    return NOT_SUPPORTED;
  }
}
