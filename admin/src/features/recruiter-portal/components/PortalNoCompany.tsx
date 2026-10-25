import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Button, EmptyState } from '@/shared/ui';

export interface PortalNoCompanyProps {
  /** Đích trang đăng ký doanh nghiệp (`PATHS.RECRUITER_SIGNUP`). */
  signupPath: string;
}

/** Người có quyền vào cổng nhưng chưa thuộc doanh nghiệp nào (`GET /me/company` → 404 `RES_001`): mời đăng ký, không để trang trống. */
const PortalNoCompany = memo(function PortalNoCompany({ signupPath }: PortalNoCompanyProps) {
  return (
    <EmptyState
      action={
        <Button asChild size="sm">
          <Link to={signupPath}>Đăng ký doanh nghiệp</Link>
        </Button>
      }
      description="Tài khoản của bạn chưa thuộc doanh nghiệp tuyển dụng nào. Đăng ký doanh nghiệp để tìm ứng viên và gửi lời mời."
      icon="building-bold"
      title="Bạn chưa có doanh nghiệp"
    />
  );
});

export default PortalNoCompany;
