/**
 * Lỗi chuẩn hoá cho MỌI thao tác đọc/ghi kho khoá sinh trắc học.
 *
 * `expo-secure-store` ném lỗi bằng CHUỖI THÔNG ĐIỆP tự do của từng nền tảng
 * (khác nhau giữa iOS/Android, và khác nhau giữa các phiên bản hệ điều hành) —
 * không có mã lỗi chuẩn hoá nào để `switch` trực tiếp. `biometric-vault.ts` soi
 * chữ trong thông điệp đó rồi quy về BỐN mã CỐ ĐỊNH ở đây; mọi nơi gọi (hook,
 * màn hình) chỉ cần biết bốn mã này, không cần biết nền tảng.
 */
export type BiometricErrorCode = 'cancelled' | 'invalidated' | 'lockout' | 'failed';

/**
 * ⛔ Là một `Error` THẬT (không phải chỉ một type) để `throw`/`catch` bình
 * thường và giữ được stack trace lúc debug — khác `type BiometricError = {...}`
 * (object thường) sẽ mất stack và dễ bị `throw` nhầm thành object trần.
 */
export class BiometricError extends Error {
  readonly code: BiometricErrorCode;

  constructor(code: BiometricErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BiometricError';
    this.code = code;
  }
}

/** Type guard tiện dùng ở nơi gọi: `if (isBiometricError(error)) ...`. */
export function isBiometricError(error: unknown): error is BiometricError {
  return error instanceof BiometricError;
}
