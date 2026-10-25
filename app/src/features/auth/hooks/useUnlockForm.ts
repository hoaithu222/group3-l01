import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import { toAuthErrorMessage } from '@/core/api/auth/auth-errors';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { completeSignIn } from '@/shell/session/sign-in';

import { APP_LOCK_PASSWORD_REQUIRES_NETWORK } from '../constants/biometric.messages';
import type { LoginFormValues } from '../schemas/auth.schemas';

/**
 * Mở khoá ứng dụng (P1) bằng MẬT KHẨU — nhánh dự phòng khi sinh trắc học/mã máy không dùng được,
 * hoặc khi người dùng muốn ĐỔI SANG TÀI KHOẢN KHÁC ngay tại lớp phủ khoá.
 *
 * ── Vì sao gọi lại `authService.login()` + `completeSignIn()`, không có nhánh riêng "so mật khẩu
 *    với tài khoản đang khoá" ────────────────────────────────────────────────────────────────
 * `app.md` §3.4 mô tả hai kết quả tưởng như khác nhau — "mật khẩu ĐÚNG tài khoản đang khoá ⇒ giữ
 * phiên" và "mật khẩu tài khoản KHÁC ⇒ đăng nhập thật" — nhưng cả hai đều là MỘT hành động phía dưới:
 * xin cặp token MỚI bằng email+mật khẩu vừa nhập, rồi để `completeSignIn()` quyết định phần còn lại:
 * cùng tài khoản thì mở khoá và ĐỨNG NGUYÊN màn đang làm (`navigate: false`), tài khoản khác thì
 * dọn dữ liệu người cũ và về Trang chủ.
 *
 * Mất mạng thì nói rõ (BIO-18): sinh trắc học/mã máy vẫn mở được, chỉ nhánh mật khẩu cần mạng.
 */
export function useUnlockForm() {
  const guard = useBusyGuard();

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => authService.login(values),
    onSuccess: (session) => completeSignIn(session, { method: 'PASSWORD', navigate: false }),
  });

  const { mutate } = mutation;
  const submit = useCallback(
    (values: LoginFormValues) => guard((release) => mutate(values, { onSettled: release })),
    [guard, mutate],
  );

  const { error } = mutation;
  const isOffline = isAxiosError(error) && !error.response;

  return {
    errorMessage: !error
      ? null
      : isOffline
        ? APP_LOCK_PASSWORD_REQUIRES_NETWORK
        : toAuthErrorMessage(error, 'login'),
    isPending: mutation.isPending,
    reset: mutation.reset,
    submit,
  };
}
