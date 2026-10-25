import { apiClient } from '../client';
import { AUTH_ENDPOINTS } from './auth.api';

/**
 * Xác minh email bằng mã 6 chữ số (BE `EmailVerificationService`, `POST /auth/verify-email/{send,confirm}`) — CẦN access token. Cơ sở để tin email của
 * tài khoản: chấp nhận lời mời theo email (p3-04, `INV_008` `EMAIL_NOT_VERIFIED`) chỉ mở khi `emailVerified`. Tách khỏi `auth.service.ts` để file đó dưới
 * trần 150 dòng — gộp lại vào `authService` bằng spread nên nơi gọi không thấy khác biệt gì.
 *
 * ⛔ `skipErrorToast`: lỗi (mã sai/hết hạn, quá 3 lần gửi mỗi 15 phút, tài khoản bị khoá tạm vì nhập sai nhiều lần) phải hiện NGAY TRONG ô nhập mã —
 * toast tự tắt sau 4 giây, trong khi người dùng còn đang gõ lại mã. Cùng luật mọi form nhập mã khác của app.
 */
export const emailVerificationAuthService = {
  /** Gửi mã tới email của tài khoản. 400 "Email đã được xác minh" nếu đã xác minh rồi; 429 khi gửi quá 3 lần/15 phút. */
  async sendEmailVerification(): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.VERIFY_EMAIL_SEND, undefined, { skipErrorToast: true });
  },

  /** Xác nhận mã 6 chữ số. Mã sai/hết hạn (15 phút) → 400; sai quá nhiều lần → khoá tạm theo tài khoản. */
  async confirmEmailVerification(code: string): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.VERIFY_EMAIL_CONFIRM, { code }, { skipErrorToast: true });
  },
};
