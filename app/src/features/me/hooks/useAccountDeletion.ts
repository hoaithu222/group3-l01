import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import type { AccountDeletionRequestPayload } from '@/core/api/auth';
import { isOwnershipBlockingDeletion, toAuthErrorMessage } from '@/core/api/auth/auth-errors';
import { purgeSession } from '@/core/api/session';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { PATHS } from '@/shell/config';
import { prepareUserInitiatedSessionEnd } from '@/shell/session/user-initiated-end';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * `useRequestAccountDeletion()` — "Xoá tài khoản (ân hạn)" (p0-01 mục 10, mở từ `me/settings`).
 *
 * ── Sau khi BE nhận yêu cầu: phiên ĐÃ CHẾT ───────────────────────────────────
 * `beginDeletionGrace` thu hồi MỌI phiên và chuyển tài khoản sang `PENDING_DELETION`, mà
 * `authenticateToken` chặn tài khoản đó ở TẦNG XÁC THỰC (403 `AUTH_012`) — không request nào có
 * token còn dùng được, kể cả `GET /auth/me`. Bản cũ giữ người dùng ở lại trong app "dùng bình
 * thường suốt thời gian ân hạn" và hiện sheet huỷ ngay trong app: mọi lượt gọi kế tiếp đều hỏng, và
 * lượt huỷ dùng token cũ cũng không tới nơi. Nên đúng luồng là (p0-01 mục 3): đăng xuất rồi sang
 * màn "Khôi phục tài khoản" — nơi có ngày hết ân hạn và lối huỷ (nhập lại email + mật khẩu).
 *
 * Thứ tự ⛔ không đảo: dọn phiên TRƯỚC rồi mới điều hướng. Nhóm `(auth)` chuyển ngược về Trang chủ
 * khi phiên còn `authenticated`. `onSuccess` đặt ở cấp `useMutation` (không phải `mutate(…, {…})`)
 * vì màn hình bị gỡ ngay khi phiên dọn xong — callback theo lượt gọi khi đó không còn chạy.
 *
 * `email` đọc TRƯỚC khi dọn phiên (sau đó hồ sơ đã mất) để điền sẵn ở màn khôi phục.
 */
export function useRequestAccountDeletion() {
  const router = useRouter();
  const guard = useBusyGuard();

  const mutation = useMutation({
    mutationFn: (payload: AccountDeletionRequestPayload) =>
      authService.requestAccountDeletion(payload),

    onSuccess: async (result) => {
      const email = useAuthStore.getState().user?.email;

      prepareUserInitiatedSessionEnd();
      await purgeSession();

      router.replace({
        pathname: PATHS.RESTORE_ACCOUNT,
        params: {
          ...(email ? { email } : {}),
          ...(result.deletionGraceUntil ? { until: result.deletionGraceUntil } : {}),
        },
      });
    },
  });

  const { mutate, reset } = mutation;
  // ⛔ Chống gửi đúp — lượt thứ hai chạy SAU khi phiên đã bị thu hồi: hoặc 401, hoặc thành công lần
  // nữa và điều hướng HAI lần. `isPending` cập nhật bất đồng bộ nên không đủ (xem `useBusyGuard`).
  const requestDeletion = useCallback(
    (payload: AccountDeletionRequestPayload, options?: { onSettled?: () => void }) =>
      guard((release) =>
        mutate(payload, {
          onSettled: () => {
            release();
            options?.onSettled?.();
          },
        }),
      ),
    [guard, mutate],
  );

  return {
    requestDeletion,
    isPending: mutation.isPending,
    /** Sai mật khẩu (`AUTH_001`) — hiện NGAY DƯỚI ô mật khẩu, không phải toast. */
    errorMessage: mutation.error ? toAuthErrorMessage(mutation.error, 'confirmPassword') : null,
    /** `USER_010`: còn là CHỦ nhóm — màn hình thêm lối tới danh sách nhóm để chuyển quyền. */
    isOwnershipBlocked: mutation.error ? isOwnershipBlockingDeletion(mutation.error) : false,
    reset,
  };
}
