import { memo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PATHS } from '@/app/config';
import ForbiddenPage from '@/app/pages/ForbiddenPage';
import { selectCanAccessAdmin, useAuthStore } from '@/app/store';
import { appConfig } from '@/core/config';
import { SessionUnavailableState } from '@/features/auth/components';
import { useSessionBootstrap } from '@/features/auth/hooks/useSessionBootstrap';
import FullScreenSpinner from './FullScreenSpinner';

/**
 * Chặn route cần đăng nhập.
 *
 * Guard THUẦN — không tự chọn layout, không kéo theo side-effect nghiệp vụ.
 * Layout do route cha quyết định.
 *
 * ⛔ Cổng là `status`, KHÔNG phải `isAuthenticated()` (đọc `exp` của JWT). Access token sống
 * 15 phút và được làm mới LƯỜI (khi ăn 401); token hết hạn mà cookie refresh còn sống vẫn là
 * phiên còn sống. Dùng `exp` làm cổng thì máy ngủ/tab nền quá 15 phút rồi bấm sang trang khác
 * là bị đá ra đăng nhập dù chẳng có gì hỏng. Phiên chết thật do `purgeAuthSession` báo bằng
 * cách đổi `status` sang `anonymous`.
 */
interface AuthGuardProps {
  /**
   * Cho tài khoản đăng nhập nhưng CHƯA có quyền quản trị nào (`user` thường) đi tiếp thay vì hiện `ForbiddenPage noAdminAccess`. CHỈ dùng cho route cố ý dành cho họ — hiện chỉ
   * `/recruiter/signup` (p6-08: người đăng ký nhà tuyển dụng chưa có quyền nào cho tới khi doanh nghiệp được tạo). Route đó tự giới hạn nội dung; BE vẫn là chốt chặn thật của từng API.
   */
  allowNoAdminAccess?: boolean;
}

const AuthGuard = memo(function AuthGuard({ allowNoAdminAccess = false }: AuthGuardProps) {
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const hasUser = useAuthStore((s) => s.user !== null);
  const canAccessAdmin = useAuthStore(selectCanAccessAdmin);

  useSessionBootstrap();

  // Cờ tắt → route mở hết. Xem `appConfig.authEnabled` để biết vì sao base mặc
  // định tắt và vì sao dự án thật BẮT BUỘC bật lại.
  if (!appConfig.authEnabled) return <Outlet />;

  if (status === 'authenticated') {
    // Có token mà chưa có hồ sơ (đang lấy `/auth/me`): chưa biết người này có được vào không.
    if (!hasUser) return <FullScreenSpinner />;
    // Đăng nhập được nhưng không có quyền quản trị nào (tài khoản `user` thường) → 403 rõ ràng
    // thay vì một giao diện trống với mọi lời gọi `/admin/*` đều 403.
    return canAccessAdmin || allowNoAdminAccess ? <Outlet /> : <ForbiddenPage noAdminAccess />;
  }

  // Chưa thử khôi phục xong thì CHỜ, đừng đá ra đăng nhập — nếu không thì mỗi
  // lần F5 người dùng sẽ thấy màn login nháy qua rồi mới quay lại trang cũ.
  if (status === 'idle' || status === 'restoring') return <FullScreenSpinner />;

  // Không hỏi được máy chủ (mất mạng / 5xx) mà trình duyệt từng đăng nhập: chưa biết phiên
  // còn hay chết → màn "thử lại", KHÔNG đá ra đăng nhập.
  if (status === 'unavailable') return <SessionUnavailableState />;

  // Nhớ đường người dùng định vào để đăng nhập xong quay lại đúng chỗ.
  return (
    <Navigate
      replace
      state={{ from: location.pathname + location.search + location.hash }}
      to={PATHS.LOGIN}
    />
  );
});

export default AuthGuard;
