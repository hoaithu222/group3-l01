import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import { toAuthErrorMessage } from '@/core/api/auth/auth-errors';
import type { RegisterFormValues } from '@/features/auth/schemas/auth.schemas';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { showToast } from '@/shared/utils/toast.utils';
import { completeSignIn } from '@/shell/session/sign-in';

import { useGoToLogin } from './useGoToLogin';

/**
 * Đăng ký tài khoản.
 *
 * Xử lý được CẢ HAI kiểu backend, vì base không chọn hộ dự án dùng kiểu nào:
 *
 *   · Trả token luôn        → `completeSignIn` (vào thẳng app).
 *   · Bắt xác thực e-mail   → `register` trả `null`; báo cho người dùng biết phải mở hộp thư,
 *                             rồi đưa về màn đăng nhập.
 *
 * ⛔ Đừng bỏ nhánh thứ hai. Không có nó thì với backend cần xác thực e-mail, người dùng bấm "Đăng
 * ký" và KHÔNG có gì xảy ra — không lỗi, không chuyển màn.
 *
 * ⛔ Nhánh có token đi qua `completeSignIn`, KHÔNG tự chép lại. Bản cũ tự `setAuth` + điều hướng nên
 * bỏ sót `reconcileBiometricBinding` (đăng ký tài khoản mới trên máy còn gắn sinh trắc học của
 * người khác ⇒ nút "Đăng nhập bằng Face ID" của người cũ vẫn hiện), `clearExplicitLogout` và gỡ
 * khoá ứng dụng — đúng lỗi BIO-15 mà `sign-in.ts` sinh ra để chặn.
 */
export function useRegister() {
  const goToLogin = useGoToLogin();
  const guard = useBusyGuard();

  const mutation = useMutation({
    mutationFn: ({ confirmPassword: _confirmPassword, ...payload }: RegisterFormValues) =>
      authService.register(payload),

    onSuccess: async (session) => {
      if (!session) {
        showToast('info', 'Đã tạo tài khoản. Kiểm tra hộp thư để kích hoạt.');
        goToLogin();
        return;
      }
      await completeSignIn(session, { method: 'PASSWORD' });
    },
  });

  const { mutate, reset } = mutation;
  // ⛔ Chống gửi đúp: lượt thứ hai ăn 409 và hiện "email đã tồn tại" dù tài khoản VỪA tạo xong.
  const register = useCallback(
    (values: RegisterFormValues) => guard((release) => mutate(values, { onSettled: release })),
    [guard, mutate],
  );

  return {
    register,
    reset,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? toAuthErrorMessage(mutation.error, 'register') : null,
  };
}
