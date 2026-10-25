import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import { toAuthErrorMessage } from '@/core/api/auth/auth-errors';
import type { LoginFormValues } from '@/features/auth/schemas/auth.schemas';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { showToast } from '@/shared/utils/toast.utils';

import { RESTORE_ACCOUNT_SUCCESS } from '../constants/restore-account.messages';
import { useGoToLogin } from './useGoToLogin';

/**
 * Huỷ yêu cầu xoá tài khoản từ màn "Khôi phục tài khoản" (`POST /me/delete-cancel`).
 *
 * ── Vì sao cần nhập LẠI email + mật khẩu ────────────────────────────────────
 * Tài khoản `PENDING_DELETION` bị BE chặn ở tầng xác thực (`AUTH_012`) và đã thu hồi mọi phiên khi
 * người dùng yêu cầu xoá — không còn token nào để dùng, nên đây là lượt gọi TRẦN như đăng nhập.
 * `cancelAccountDeletion` đã bật `skipErrorToast`/`skipAuthRefresh`: sai mật khẩu, hết ân hạn
 * (`USER_011`) hiện trong form, và 401 không bị hiểu nhầm thành "phiên hết hạn".
 *
 * Thành công ⇒ toast + về màn Đăng nhập (BE chỉ trả `{ status: 'ACTIVE' }`, không cấp token).
 * ⛔ Không tự đăng nhập bằng mật khẩu vừa gõ: thêm một lượt xoay refresh token và một nhánh lỗi mới
 * chỉ để tiết kiệm hai lần chạm.
 */
export function useRestoreAccount() {
  const guard = useBusyGuard();
  const goToLogin = useGoToLogin();

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => authService.cancelAccountDeletion(values),
    onSuccess: () => {
      showToast('success', RESTORE_ACCOUNT_SUCCESS);
      goToLogin();
    },
  });

  const { mutate, reset } = mutation;
  // ⛔ Chống gửi đúp — lượt thứ hai ăn 409 `USER_011` ("không ở trạng thái chờ xoá") dù lượt đầu đã thành công.
  const restore = useCallback(
    (values: LoginFormValues) => guard((release) => mutate(values, { onSettled: release })),
    [guard, mutate],
  );

  return {
    restore,
    reset,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? toAuthErrorMessage(mutation.error, 'login') : null,
  };
}
