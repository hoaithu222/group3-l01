import { memo, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { AuthPageHeading } from '@/features/auth/components';
import { Button, Callout, Skeleton, Text } from '@/shared/ui';

import SignupDone from '../components/SignupDone';
import SignupForm from '../components/SignupForm';
import { PORTAL_HOME_PATH } from '../constants/portal.constants';
import { useMyCompany, useRegisterCompany } from '../service/company.queries';
import { isFeatureDisabledError, isNoCompanyError } from '../utils/portal-errors';
import { refreshAuthUser } from '../utils/refresh-auth-user';

/**
 * Trang `/recruiter/signup` (admin.md p6-08 §2.8) — đăng ký doanh nghiệp tuyển dụng. Route ĐỘC LẬP ngoài registry: cần đăng nhập nhưng KHÔNG cần quyền quản trị (người đăng ký là tài khoản `user` thường
 * chưa có quyền nào) nên đứng sau `AuthGuard allowNoAdminAccess`, dùng khung `AuthLayout` (không có Dock).
 *
 * Bốn trường hợp: đang kiểm tra (`GET /me/company`) · ĐÃ thuộc doanh nghiệp → làm mới quyền rồi chuyển thẳng vào cổng · tính năng chưa bật (404 `CFG_005`) · chưa có → form. Đăng ký xong hiện màn "Đã gửi đăng ký,
 * chờ duyệt"; quyền mới (`recruiter:view`) đã được làm mới ngay trong `useRegisterCompany` nên "Vào cổng" không kẹt ở màn "không có quyền".
 */
const RecruiterSignupPage = memo(function RecruiterSignupPage() {
  const navigate = useNavigate();
  const me = useMyCompany();
  // Mutation do TRANG giữ: "đã đăng ký" suy từ `isSuccess`, còn `isPending` bao trùm cả bước làm mới quyền — hai cờ đó chặn effect chuyển-vào-cổng bên dưới chạy giữa chừng
  // (lúc `useRegisterCompany` vừa ghi doanh nghiệp mới vào cache `me` nhưng màn "Đã gửi đăng ký" chưa kịp hiện).
  const register = useRegisterCompany();
  const done = register.isSuccess;
  const isMember = !!me.data;
  const busy = register.isPending;

  // Đã thuộc doanh nghiệp: quyền trong store có thể còn cũ (phiên mở trước khi được thêm vào) → làm mới rồi mới vào cổng, tránh 403.
  useEffect(() => {
    if (!isMember || done || busy) return;
    let cancelled = false;
    void refreshAuthUser().then(() => {
      if (!cancelled) void navigate(PORTAL_HOME_PATH, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [isMember, done, busy, navigate]);

  const handleEnterPortal = useCallback(() => void navigate(PORTAL_HOME_PATH, { replace: true }), [navigate]);

  let body: ReactNode;
  if (done) {
    body = <SignupDone onEnterPortal={handleEnterPortal} />;
  } else if (isMember) {
    body = (
      <div aria-label="Đang chuyển vào cổng nhà tuyển dụng" className="flex flex-col gap-2" role="status">
        <Skeleton className="w-full" height={32} />
        <Skeleton className="w-full" height={96} />
      </div>
    );
  } else if (me.isError && isFeatureDisabledError(me.error)) {
    body = (
      <Callout
        description="Bảng tin tuyển dụng chưa được bật trên hệ thống này. Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn."
        intent="warning"
        title="Chưa mở đăng ký nhà tuyển dụng"
      />
    );
  } else if (me.isError && !isNoCompanyError(me.error)) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void me.refetch()}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không kiểm tra được tài khoản của bạn"
      />
    );
  } else if (me.isPending) {
    body = <Skeleton className="w-full" height={160} />;
  } else {
    body = <SignupForm registering={busy} onRegister={register.mutateAsync} />;
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <AuthPageHeading
        description="Doanh nghiệp được xác minh trước khi tìm ứng viên và gửi lời mời."
        title="Đăng ký nhà tuyển dụng"
      />
      {body}
      <Text className="text-center" size="tiny" skin="muted">
        <Link className="text-link hover:underline" to={PATHS.HOME}>
          Về trang chủ
        </Link>
      </Text>
    </div>
  );
});

export default RecruiterSignupPage;
