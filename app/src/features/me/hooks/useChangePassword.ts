import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import { toAuthErrorMessage } from '@/core/api/auth/auth-errors';
import { purgeSession } from '@/core/api/session';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { PATHS } from '@/shell/config';
import { applyRotatedAccessToken } from '@/shell/session/rotate-access-token';

import {
  CHANGE_PASSWORD_RELOGIN,
  changePasswordSuccessMessage,
} from '../constants/change-password.messages';
import type { ChangePasswordFormValues } from '../schemas/change-password.schemas';

/**
 * Đổi mật khẩu (p0-01 mục 10, mở từ `me/settings`).
 *
 * ── Sau khi BE nhận lượt đổi ─────────────────────────────────────────────────
 * BE thu hồi mọi phiên KHÁC, và access token đang cầm (mang `sessionVersion` cũ) hết hiệu lực:
 *  · Có `accessToken` mới trong phản hồi ⇒ ghi vào store + nối lại socket (BE vừa ngắt nó), báo
 *    "đã đăng xuất khỏi N thiết bị khác", quay về Cài đặt. Bỏ bước ghi token thì request kế tiếp ăn
 *    401 rồi mới tự làm mới — một lượt lỗi và một lượt xoay refresh token vô ích.
 *  · KHÔNG có ⇒ BE không xác định được phiên này nên đã thu hồi TẤT CẢ, kể cả nó: dọn phiên và về
 *    màn Đăng nhập, ⛔ không để người dùng ở lại trong app với phiên đã chết.
 *
 * ⛔ Lỗi hiện trong form (`authService` đã bật `skipErrorToast`), dịch theo NGỮ CẢNH: BE trả 401
 * `AUTH_002` cho "mật khẩu hiện tại sai", mà bảng mã của app ghi mã đó là "Token không hợp lệ".
 */
export function useChangePassword() {
  const router = useRouter();
  const guard = useBusyGuard();

  const mutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: ChangePasswordFormValues) =>
      authService.changePassword({ currentPassword, newPassword }),

    onSuccess: async (result) => {
      if (result.accessToken) {
        applyRotatedAccessToken(result.accessToken);
        // Rung "xong" cùng lúc với toast thành công — chỉ ở nhánh ở lại app; nhánh phải đăng nhập lại không phải "xong".
        hapticSuccess();
        showToast('success', changePasswordSuccessMessage(result.revokedSessions));
        router.back();
        return;
      }

      await purgeSession();
      showToast('info', CHANGE_PASSWORD_RELOGIN);
      router.replace(PATHS.LOGIN);
    },
  });

  const { mutate, reset } = mutation;
  // ⛔ Chống gửi đúp: hai lượt đổi liền nhau, lượt sau ăn 400 "mật khẩu mới phải khác mật khẩu hiện tại".
  const changePassword = useCallback(
    (values: ChangePasswordFormValues) =>
      guard((release) => mutate(values, { onSettled: release })),
    [guard, mutate],
  );

  return {
    changePassword,
    reset,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? toAuthErrorMessage(mutation.error, 'changePassword') : null,
  };
}
