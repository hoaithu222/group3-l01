import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { EmptyState, PageShell } from '@/shared/ui';
import { ChangePasswordModal } from '../components';

/**
 * Đích của link "Đổi mật khẩu" trong email cảnh báo "đăng nhập từ thiết bị mới" (BE dựng link
 * `FRONTEND_URL/change-password`). Trước đây route này không tồn tại — bấm link trong email rơi
 * vào trang 404 đúng lúc người dùng đang lo tài khoản bị lộ.
 *
 * Nằm sau `AuthGuard`: chưa đăng nhập thì được đưa qua `/login` rồi quay lại đây (`from`). Mở sẵn
 * hộp thoại đổi mật khẩu; đóng (đổi xong hay huỷ) thì về trang chủ — trang nền chỉ là chỗ đỡ hộp thoại.
 */
const ChangePasswordPage = memo(function ChangePasswordPage() {
  const navigate = useNavigate();

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) navigate(PATHS.HOME, { replace: true });
    },
    [navigate],
  );

  return (
    <PageShell variant="center">
      <EmptyState
        description="Nhập mật khẩu hiện tại và mật khẩu mới trong hộp thoại vừa mở."
        icon="lock-bold"
        iconColor="sky"
        title="Đổi mật khẩu"
      />
      <ChangePasswordModal open onOpenChange={handleOpenChange} />
    </PageShell>
  );
});

export default ChangePasswordPage;
