import { memo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { appConfig } from '@/core/config';
import { useSessionBootstrap } from '@/features/auth/hooks/useSessionBootstrap';
import { sanitizeRedirectPath } from '@/features/auth/utils/redirect';
import FullScreenSpinner from './FullScreenSpinner';

/**
 * Chặn người đã đăng nhập vào lại các trang khách (login/register/quên mật khẩu).
 *
 * Người đã có phiên được đưa về đúng nơi họ định vào (`state.from` do `AuthGuard` ghi, đã
 * qua `sanitizeRedirectPath`) hoặc trang chủ — KHÔNG luôn về trang chủ: đăng nhập xong mà
 * mất deep-link là do guard này giành điều hướng với `LoginPage`.
 *
 * Mở thẳng `/login` sau F5 khi cookie refresh còn sống (bookmark trang đăng nhập) cũng phải
 * vào được ứng dụng: nên guard này cũng khôi phục phiên — nhưng CHỈ khi trình duyệt có dấu hiệu
 * từng đăng nhập, để người chưa từng đăng nhập không tốn một lượt `refresh` chắc chắn 401.
 */
const GuestGuard = memo(function GuestGuard() {
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const hasHint = useAuthStore((s) => s.user !== null);

  useSessionBootstrap({ onlyWithHint: true });

  // Cờ tắt → vẫn xem được 4 trang khách (để dựng giao diện đăng nhập mà không
  // cần backend). Bật cờ thì chúng lại đẩy người đã đăng nhập về trang chủ.
  if (!appConfig.authEnabled) return <Outlet />;

  if (status === 'authenticated') {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate replace to={sanitizeRedirectPath(from)} />;
  }

  // Đang khôi phục (hoặc sắp khôi phục vì có dấu hiệu từng đăng nhập): đừng nháy form đăng
  // nhập rồi mới chuyển trang.
  if (status === 'restoring' || (status === 'idle' && hasHint)) return <FullScreenSpinner />;

  return <Outlet />;
});

export default GuestGuard;
