import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import { toAuthErrorMessage } from '@/core/api/auth/auth-errors';
import type {
  ForgotPasswordFormValues,
  ResetPasswordFormValues,
} from '@/features/auth/schemas/auth.schemas';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { showToast } from '@/shared/utils/toast.utils';

import { useGoToLogin } from './useGoToLogin';

/**
 * Gửi yêu cầu đặt lại mật khẩu.
 *
 * ⛔ Thông báo thành công phải TRUNG TÍNH: "Nếu e-mail tồn tại, chúng tôi đã gửi hướng dẫn." Nói
 * thẳng "Đã gửi tới a@b.com" biến màn hình này thành công cụ dò xem một địa chỉ có tài khoản trong
 * hệ thống hay không. Backend tử tế cũng trả 200 cho cả hai ca vì lý do này. Câu nằm ở màn hình
 * (dải `Alert` không tự tắt) chứ không phải toast: đó là HƯỚNG DẪN bước kế tiếp, toast 5 giây
 * biến mất trước khi người dùng kịp mở hộp thư.
 *
 * Lỗi (429, sai định dạng…) hiện TRONG form (`skipErrorToast` ở service) — trước đây cả toast lẫn
 * dải lỗi cùng hiện.
 */
export function useForgotPassword() {
  const guard = useBusyGuard();
  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordFormValues) => authService.forgotPassword(values),
  });

  const { mutate, reset } = mutation;
  // ⛔ Chống gửi đúp — hai lượt là hai email đặt lại mật khẩu, mà chỉ mã ĐẦU còn dùng được.
  const requestReset = useCallback(
    (values: ForgotPasswordFormValues) =>
      guard((release) => mutate(values, { onSettled: release })),
    [guard, mutate],
  );

  return {
    requestReset,
    reset,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage: mutation.error ? toAuthErrorMessage(mutation.error, 'forgotPassword') : null,
  };
}

/** Đặt lại mật khẩu bằng mã nhận qua e-mail. */
export function useResetPassword() {
  const goToLogin = useGoToLogin();
  const guard = useBusyGuard();

  const mutation = useMutation({
    // ⛔ B4 (p0-01): form đặt tên field `password` cho khớp UX, nhưng BE đòi `newPassword`
    // (`resetPasswordSchema` ở `auth.dto.ts`) — thiếu bước map này thì mọi lượt đặt lại mật khẩu
    // bị BE từ chối 400 ngay từ validate.
    mutationFn: ({ token, password }: ResetPasswordFormValues) =>
      authService.resetPassword({ token, newPassword: password }),
    onSuccess: () => {
      showToast('success', 'Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.');
      goToLogin();
    },
  });

  const { mutate, reset } = mutation;
  const resetPassword = useCallback(
    (values: ResetPasswordFormValues) => guard((release) => mutate(values, { onSettled: release })),
    [guard, mutate],
  );

  return {
    resetPassword,
    reset,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? toAuthErrorMessage(mutation.error, 'resetPassword') : null,
  };
}
