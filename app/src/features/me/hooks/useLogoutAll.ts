import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import { purgeSession } from '@/core/api/session';
import { deleteSecret } from '@/core/auth/biometric';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { showToast } from '@/shared/utils/toast.utils';
import { PATHS } from '@/shell/config';
import { prepareUserInitiatedSessionEnd } from '@/shell/session/user-initiated-end';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { LOGOUT_ALL_DONE_MESSAGE } from '../constants/session.messages';

/**
 * `useLogoutAll()` — "Đăng xuất tất cả thiết bị" ở màn "Phiên đăng nhập" (`POST /auth/logout-all`).
 *
 * ── Sau khi BE xác nhận: phiên của CHÍNH MÁY NÀY cũng đã chết ────────────────────
 * BE thu hồi mọi phiên, tăng `sessionVersion` (access token đang cầm hết hiệu lực ngay), thu hồi mọi credential sinh trắc
 * học + push token và ngắt socket. Nên đúng luồng là dọn phiên phía máy rồi về màn Đăng nhập — KHÔNG gọi thêm
 * `POST /auth/logout` (refresh token đã chết, chỉ tốn một vòng mạng) và KHÔNG gọi `unregisterThisDevice()` (token đã
 * chết ⇒ 401; BE đã tự gỡ push token của mọi thiết bị).
 *
 * Thứ tự ⛔ không đảo, cùng khuôn `useRequestAccountDeletion` (cũng là "BE vừa thu hồi mọi phiên"):
 *  1. `prepareUserInitiatedSessionEnd()` — đánh dấu đăng xuất chủ ý (màn Đăng nhập không tự bật hộp quét sinh trắc học) và
 *     xoá lời mời/đích đến đang chờ của người này.
 *  2. Dọn gắn kết sinh trắc học CỤC BỘ: credential đã bị BE thu hồi nên giữ cờ + bí mật trong máy chỉ khiến màn Đăng nhập
 *     hiện nút quét vân tay để rồi ăn `AUTH_014`. Chỉ dọn phía máy (không `disableBiometric`, vì nó còn gọi `DELETE
 *     /auth/biometric/credentials/:id` bằng token đã chết). Khác đăng xuất thường — thứ GIỮ gắn kết (p0-13 §2).
 *  3. `purgeSession()` — xoá token + refresh token, rồi `onSessionEnded` dọn store/cache/khoá theo người dùng
 *     (`wipeUserData`), ngắt socket và dọn thông báo cục bộ.
 *  4. Toast SAU bước 3 (bước dọn có xoá hàng đợi toast) rồi mới `router.replace`.
 *
 * ⛔ Lượt gọi HỎNG (mất mạng, 429) thì KHÔNG dọn gì: người dùng còn nguyên phiên để bấm lại, và interceptor đã toast lỗi
 * đúng MỘT lần — xem `logoutAuthService.logoutAll`. `onSuccess` đặt ở cấp `useMutation` (không phải `mutate(…, {…})`) vì
 * màn hình bị gỡ ngay khi phiên dọn xong, callback theo lượt gọi khi đó không còn chạy.
 */
export function useLogoutAll() {
  const router = useRouter();
  const guard = useBusyGuard();

  const mutation = useMutation({
    mutationFn: () => authService.logoutAll(),

    onSuccess: async () => {
      prepareUserInitiatedSessionEnd();
      // Chỉ dọn gắn kết của CHÍNH người này: BE chỉ thu hồi credential của `user` đang gọi (máy chỉ gắn được một tài khoản).
      const { binding } = useBiometricStore.getState();
      if (binding && binding.userId === useAuthStore.getState().user?.id) {
        useBiometricStore.getState().clearBinding();
        await deleteSecret();
      }
      await purgeSession();

      showToast('success', LOGOUT_ALL_DONE_MESSAGE);
      router.replace(PATHS.LOGIN);
    },
  });

  const { mutate } = mutation;
  // ⛔ Chống bấm đúp: lượt thứ hai chạy SAU khi phiên đã bị thu hồi thì ăn 401, và thấy lỗi dù việc đã xong.
  const logoutAll = useCallback(
    (options?: { onSettled?: () => void }) =>
      guard((release) =>
        mutate(undefined, {
          onSettled: () => {
            release();
            options?.onSettled?.();
          },
        }),
      ),
    [guard, mutate],
  );

  return { logoutAll, isPending: mutation.isPending };
}
