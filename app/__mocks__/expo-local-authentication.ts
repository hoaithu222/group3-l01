/**
 * Mock `expo-local-authentication` cho Jest.
 *
 * Module gọi thẳng xuống code NATIVE (Face ID / vân tay / mã khoá máy) — không
 * có bản chạy được trong Node. Đăng ký ở `jest.setup.js`
 * (`jest.mock('expo-local-authentication')`) để MỌI test dùng chung một bản
 * mock, giống cách `expo-secure-store`/`@react-native-community/netinfo` đã có
 * sẵn — xem chú thích ở đó.
 *
 * ⚠️ Enum giữ ĐÚNG giá trị số của bản thật (`FINGERPRINT=1`,
 * `FACIAL_RECOGNITION=2`, `IRIS=3`). `biometric-capability.ts` so khớp bằng
 * GIÁ TRỊ này (`types.includes(AuthenticationType.FINGERPRINT)`), không phải
 * bằng tên — lệch số là test XANH GIẢ trong khi logic thật sai.
 */
export enum AuthenticationType {
  FINGERPRINT = 1,
  FACIAL_RECOGNITION = 2,
  IRIS = 3,
}

export enum SecurityLevel {
  NONE = 0,
  SECRET = 1,
  BIOMETRIC_WEAK = 2,
  BIOMETRIC_STRONG = 3,
}

export const hasHardwareAsync = jest.fn(async () => true);
export const supportedAuthenticationTypesAsync = jest.fn(async () => [
  AuthenticationType.FINGERPRINT,
]);
export const isEnrolledAsync = jest.fn(async () => true);
export const getEnrolledLevelAsync = jest.fn(async () => SecurityLevel.BIOMETRIC_STRONG);
export const authenticateAsync = jest.fn(async () => ({ success: true }) as const);
export const cancelAuthenticate = jest.fn(async () => undefined);

/**
 * CHỈ dùng trong test: đặt lại mọi mock về mặc định "máy tốt, quét thành
 * công" — gọi ở `beforeEach` của những suite cần tự chỉnh hành vi (vd trả
 * `hasHardwareAsync` = `false` để test nhánh "không hỗ trợ").
 */
export function __resetLocalAuthenticationMock(): void {
  hasHardwareAsync.mockReset();
  hasHardwareAsync.mockResolvedValue(true);
  supportedAuthenticationTypesAsync.mockReset();
  supportedAuthenticationTypesAsync.mockResolvedValue([AuthenticationType.FINGERPRINT]);
  isEnrolledAsync.mockReset();
  isEnrolledAsync.mockResolvedValue(true);
  getEnrolledLevelAsync.mockReset();
  getEnrolledLevelAsync.mockResolvedValue(SecurityLevel.BIOMETRIC_STRONG);
  authenticateAsync.mockReset();
  authenticateAsync.mockResolvedValue({ success: true });
  cancelAuthenticate.mockReset();
  cancelAuthenticate.mockResolvedValue(undefined);
}
