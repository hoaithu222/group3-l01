import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { PATHS } from '@/shell/config';

/**
 * Về màn Đăng nhập từ một màn khác của nhóm `(auth)` (đăng ký, quên/đặt lại mật khẩu, khôi phục).
 *
 * ── Vì sao `dismissTo`, ⛔ không `replace`/`push` ─────────────────────────────
 * `dismissTo` lùi về màn Đăng nhập ĐÃ CÓ trong ngăn xếp; không có (mở thẳng bằng deep link
 * `/reset-password?token=…`) thì thay màn hiện tại bằng nó. `replace` trên ngăn xếp
 * [Đăng nhập, Quên mật khẩu] sinh [Đăng nhập, Quên mật khẩu, Đăng nhập], và nút Back của Android
 * lôi người dùng ngược về "Quên mật khẩu" ngay sau khi họ vừa đổi xong mật khẩu; `push` còn tệ hơn
 * — chồng thêm một bản Đăng nhập mỗi lần bấm liên kết.
 */
export function useGoToLogin(): () => void {
  const router = useRouter();
  return useCallback(() => router.dismissTo(PATHS.LOGIN), [router]);
}
