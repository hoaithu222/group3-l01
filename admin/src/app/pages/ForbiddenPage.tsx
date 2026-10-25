import { memo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { useAuthStore } from '@/app/store';
import { useSignOut } from '@/features/auth/hooks/useSignOut';
import { Button, Heading, Text } from '@/shared/ui';

interface ForbiddenPageProps {
  /**
   * Người này đăng nhập được nhưng KHÔNG có quyền quản trị nào (tài khoản `user` thường):
   * `AuthGuard` hiện trang này thay cho cả ứng dụng. Về trang chủ chỉ quay lại đúng trang này,
   * nên chỉ còn lối thoát duy nhất — đăng xuất để dùng tài khoản khác.
   */
  noAdminAccess?: boolean;
}

const ForbiddenPage = memo(function ForbiddenPage({ noAdminAccess = false }: ForbiddenPageProps) {
  const navigate = useNavigate();
  const email = useAuthStore((s) => s.user?.email ?? null);
  const signOut = useSignOut();
  const handleBack = useCallback(() => navigate(-1), [navigate]);

  const who = email ? `Bạn đang đăng nhập bằng ${email}, nhưng tài khoản` : 'Tài khoản';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg-base p-4 text-center">
      <Text className="text-h1-bold text-fg-5" size="extraLarge">
        403
      </Text>
      <Heading size="small">
        {noAdminAccess ? 'Tài khoản chưa được cấp quyền quản trị' : 'Không có quyền truy cập'}
      </Heading>
      <Text className="max-w-md" size="small" skin="muted">
        {noAdminAccess
          ? `${who} này chưa được cấp quyền vào trang quản trị. Đăng xuất để dùng tài khoản khác, hoặc liên hệ quản trị viên.`
          : 'Tài khoản của bạn chưa được cấp quyền vào khu vực này. Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.'}
      </Text>
      <div className="flex gap-2">
        {!noAdminAccess && (
          <>
            <Button variant="stroke" onClick={handleBack}>
              Quay lại
            </Button>
            <Button asChild variant="primary">
              <Link to={PATHS.HOME}>Về trang chủ</Link>
            </Button>
          </>
        )}
        {/* p6-08: tài khoản thường có thể tự đăng ký làm nhà tuyển dụng (`/recruiter/signup` cố ý cho qua `AuthGuard` khi chưa có quyền quản trị). */}
        {noAdminAccess && (
          <Button asChild variant="stroke">
            <Link to={PATHS.RECRUITER_SIGNUP}>Đăng ký nhà tuyển dụng</Link>
          </Button>
        )}
        {/* Đăng xuất ngay ở đây: tài khoản đang đứng trước cánh cửa đóng cần một lối thoát. */}
        {email !== null && (
          <Button variant={noAdminAccess ? 'primary' : 'ghost'} onClick={signOut}>
            Đăng xuất
          </Button>
        )}
      </div>
    </div>
  );
});

export default ForbiddenPage;
