import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import {
  getDeletionGraceUntil,
  isAccountPendingDeletion,
  toAuthErrorMessage,
} from '@/core/api/auth/auth-errors';
import type { LoginFormValues } from '@/features/auth/schemas/auth.schemas';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { isNetworkError } from '@/shared/utils/errors/to-error-message';
import { hapticWarning } from '@/shared/utils/haptics';
import { PATHS } from '@/shell/config';
import { completeSignIn } from '@/shell/session/sign-in';

/**
 * Đăng nhập.
 *
 * Trả về `error` dạng CHUỖI ĐÃ DỊCH thay vì `AxiosError` thô, để màn hình chỉ việc hiển thị.
 * `authService.login` đã bật `skipErrorToast` nên lỗi KHÔNG ra toast — sai mật khẩu là chuyện
 * thường ngày, câu lỗi phải nằm ngay dưới ô nhập chứ không phải bay ngang màn hình rồi biến mất.
 * Câu được dịch theo NGỮ CẢNH (`toAuthErrorMessage`): BE trả sai mật khẩu bằng mã `AUTH_002`, mà
 * bảng mã của app ghi mã đó là "Token không hợp lệ".
 *
 * ⚠️ `onSuccess` chỉ còn MỘT dòng — `completeSignIn()` (`shell/session/sign-in.ts`) gom mọi việc
 * sau đăng nhập (xoá cache, lấy hồ sơ nếu thiếu, ghi phiên, đối chiếu gắn kết sinh trắc học, điều
 * hướng) làm MỘT đường DUY NHẤT, dùng chung với đăng ký, sinh trắc học và mở khoá ứng dụng.
 *
 * `AUTH_012` (tài khoản đang chờ xoá) ⇒ sang màn "Khôi phục tài khoản" với email đã nhập (và mốc hết ân hạn nếu BE
 * kèm `details.deletionGraceUntil`): BE đã thu hồi phiên và khoá đăng nhập, nên đó là lối duy nhất để dùng lại tài khoản.
 */
export function useLogin() {
  const router = useRouter();
  const guard = useBusyGuard();

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => authService.login(values),
    onSuccess: (session) => completeSignIn(session, { method: 'PASSWORD' }),
    onError: (error, values) => {
      if (isAccountPendingDeletion(error)) {
        // BE (rà soát auth) kèm `details.deletionGraceUntil` khi mật khẩu đúng: màn khôi phục nêu đúng ngày hết ân hạn.
        const until = getDeletionGraceUntil(error);
        router.push({
          pathname: PATHS.RESTORE_ACCOUNT,
          params: until ? { email: values.email, until } : { email: values.email },
        });
      } else if (!isNetworkError(error)) {
        // Máy chủ TỪ CHỐI (sai mật khẩu, bị khoá, quá số lần) ⇒ rung cảnh báo MỘT lần, cùng nhịp quyển sách đầu màn lắc
        // (`AuthHero`). ⛔ Không rung khi mất mạng (`shared/utils/haptics.ts`): không tới được máy chủ không phải lỗi của người
        // dùng. `AUTH_012` cũng không: nó dẫn sang màn Khôi phục, chính cú chuyển màn là phản hồi.
        hapticWarning();
      }
    },
  });

  const { mutate, reset } = mutation;
  // ⛔ Chống gửi đúp — xem `useBusyGuard` (nút đã khoá khi `loading`, bàn phím thì không).
  const login = useCallback(
    (values: LoginFormValues) => guard((release) => mutate(values, { onSettled: release })),
    [guard, mutate],
  );

  return {
    login,
    isPending: mutation.isPending,
    /** Câu lỗi tiếng Việt, `null` khi chưa có lỗi. */
    errorMessage: mutation.error ? toAuthErrorMessage(mutation.error, 'login') : null,
    reset,
  };
}
