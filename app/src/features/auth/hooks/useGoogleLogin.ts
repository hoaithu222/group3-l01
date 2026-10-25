import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { authService, toAuthErrorMessage } from '@/core/api/auth';
import type { NormalizedSession } from '@/core/api/auth';
import { GoogleSignInError, isGoogleSignInAvailable, signInWithGoogle } from '@/core/auth/social';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { completeSignIn } from '@/shell/session/sign-in';

import { GOOGLE_SIGN_IN_ERRORS } from '../constants/social.messages';

/**
 * Đăng nhập bằng Google (qua Firebase).
 *
 * ── Luồng ────────────────────────────────────────────────────────────────────
 *   1. `signInWithGoogle()` — hộp chọn tài khoản → Firebase ID token (`core/auth/social`).
 *   2. `authService.firebaseLogin({ idToken })` — tự lấy nonce MỚI rồi `POST /auth/firebase-login`.
 *   3. `completeSignIn(session, { method: 'SOCIAL' })` — MỘT đường duy nhất sau mọi lượt đăng nhập.
 *
 * Người dùng tự huỷ hộp chọn tài khoản ⇒ KHÔNG lỗi, KHÔNG thay đổi gì (`mutationFn` trả `null`).
 *
 * ⚠️ Hai loại lỗi, hai bảng câu chữ: lỗi phía máy (`GoogleSignInError` — thiếu Play Services, mất mạng…) dịch theo `reason`;
 * lỗi từ BE (`AUTH_022` token cũ/sai, `AUTH_023` email chưa xác minh, `AUTH_011/012` khoá/chờ xoá, 503 chưa cấu hình Firebase)
 * dịch theo NGỮ CẢNH `socialLogin` — `AUTH_022` là 401 nhưng KHÔNG phải "sai mật khẩu".
 */
export function useGoogleLogin() {
  const guard = useBusyGuard();

  const mutation = useMutation({
    mutationFn: async (): Promise<NormalizedSession | null> => {
      const result = await signInWithGoogle();
      if (result.status === 'cancelled') return null;
      return authService.firebaseLogin({ idToken: result.idToken });
    },
    onSuccess: async (session) => {
      if (session) await completeSignIn(session, { method: 'SOCIAL' });
    },
  });

  const { mutate, reset } = mutation;
  // ⛔ Chống bấm đúp — `isPending` cập nhật bất đồng bộ nên hai lần chạm sát nhau vẫn mở HAI hộp chọn tài khoản.
  const login = useCallback(() => guard((release) => mutate(undefined, { onSettled: release })), [guard, mutate]);

  const { error } = mutation;
  return {
    /** Có nên hiện nút không (Android + có `webClientId`) — xem `isGoogleSignInAvailable`. */
    available: isGoogleSignInAvailable(),
    login,
    isPending: mutation.isPending,
    /** Câu lỗi tiếng Việt, `null` khi chưa có lỗi hoặc người dùng tự huỷ. */
    errorMessage: error
      ? error instanceof GoogleSignInError
        ? GOOGLE_SIGN_IN_ERRORS[error.reason]
        : toAuthErrorMessage(error, 'socialLogin')
      : null,
    reset,
  };
}
