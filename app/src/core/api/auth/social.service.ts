import { apiClient } from '../client';
import { unwrapData } from '../unwrap';
import { AUTH_ENDPOINTS } from './auth.api';
import { withFreshNonce } from './auth.nonce';
import { normalize, persistSession } from './auth.session-helpers';
import type { FirebaseLoginPayload, LoginResponse, NormalizedSession } from './auth.types';

/**
 * Đăng nhập mạng xã hội — tách khỏi `auth.service.ts` (trần 150 dòng), gộp lại vào `authService` bằng spread.
 */
export const socialAuthService = {
  /**
   * `POST /auth/firebase-login` — chưa có tài khoản thì BE tạo mới (email đã xác minh, không mật khẩu), trùng email đã xác minh
   * thì vào đúng tài khoản đó.
   *
   * ⛔ Nonce lấy MỚI ở đây (sau khi đã có `idToken`), không lấy trước lúc mở hộp chọn tài khoản Google: người dùng chọn tài khoản
   * có thể mất vài chục giây, mà nonce chỉ sống 120 giây và dùng một lần. `withFreshNonce` còn tự thử lại ĐÚNG MỘT LẦN khi BE
   * từ chối nonce (`AUTH_018`) — vẫn với CHÍNH `idToken` này (BE chỉ nhận token của lần xác thực trong 5 phút gần nhất, `AUTH_022`).
   *
   * `skipAuthRefresh` + `skipErrorToast` giống `login`: 401 ở đây là "token Firebase không hợp lệ", không phải phiên hết hạn, và
   * lỗi hiện NGAY TRONG màn đăng nhập chứ không phải toast.
   */
  async firebaseLogin(payload: FirebaseLoginPayload): Promise<NormalizedSession> {
    const response = await withFreshNonce((nonce) =>
      apiClient.post<LoginResponse>(
        AUTH_ENDPOINTS.FIREBASE_LOGIN,
        { idToken: payload.idToken, nonce },
        { skipAuthRefresh: true, skipErrorToast: true },
      ),
    );

    const session = normalize(unwrapData<LoginResponse>(response));
    await persistSession(session);
    return session;
  },
};
