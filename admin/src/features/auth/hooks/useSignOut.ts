import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { useLogout } from '../service/auth.queries';

/**
 * Đăng xuất rồi về trang đăng nhập — dùng chung cho menu người dùng và trang 403.
 *
 * Điều hướng SAU khi phiên đã xoá (`onSettled` của lời gọi chạy sau `onSettled` của
 * `useLogout`): điều hướng trước thì `AuthGuard` còn thấy phiên và đá ngược về đúng trang cũ.
 * `replace` để nút Back không quay lại một trang cần đăng nhập.
 */
export function useSignOut(): () => void {
  const navigate = useNavigate();
  const { mutate } = useLogout();

  return useCallback(
    () => mutate(undefined, { onSettled: () => navigate(PATHS.LOGIN, { replace: true }) }),
    [mutate, navigate],
  );
}
