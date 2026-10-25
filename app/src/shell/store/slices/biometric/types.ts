import type { BiometricKind } from '@/core/auth/biometric';

/**
 * Gắn kết đăng nhập sinh trắc học trên MÁY NÀY — dữ liệu KHÔNG NHẠY CẢM.
 *
 * ⛔ Không có trường `secret` ở đây — bí mật thật nằm trong Keychain/Keystore
 * (`core/auth/biometric/biometric-vault.ts`), KHÔNG BAO GIỜ đi qua `AsyncStorage`.
 * Slice này chỉ nhớ "máy đang gắn với tài khoản nào" để vẽ đúng UI (hiện nút,
 * hiện đúng email) — mất nó (gỡ app, xoá dữ liệu) không rò rỉ gì, chỉ coi như
 * chưa bật tính năng.
 */
export interface BiometricBinding {
  userId: string;
  email: string;
  credentialId: string;
  /** ISO 8601 — hạn tuyệt đối của credential phía BE (`credentialMaxAgeDays`). */
  expiresAt: string;
  kind: BiometricKind;
}

export interface BiometricState {
  binding: BiometricBinding | null;
  /** `AsyncStorage` đã nạp xong chưa — xem `waitForBiometricHydration()`. */
  hasHydrated: boolean;
}

export interface BiometricActions {
  setBinding: (binding: BiometricBinding) => void;
  /** Gỡ gắn — CHỈ xoá phần state này. Xoá bí mật + thu hồi phía BE là việc của
   *  `disableBiometric()` (`reconcile.ts`), ⛔ đừng gọi hàm này một mình rồi
   *  tưởng đã "tắt tính năng" xong. */
  clearBinding: () => void;
  setHasHydrated: (value: boolean) => void;
}

export type BiometricStore = BiometricState & BiometricActions;
