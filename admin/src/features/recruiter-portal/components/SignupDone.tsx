import { memo } from 'react';

import { Button, Callout } from '@/shared/ui';

export interface SignupDoneProps {
  /** Vào cổng nhà tuyển dụng (đã làm mới quyền — xem `refreshAuthUser`). */
  onEnterPortal: () => void;
}

/** Màn "Đã gửi đăng ký, chờ duyệt" sau khi tạo doanh nghiệp (admin.md p6-08 §2.8). Vận hành xác minh trong 1–2 ngày làm việc; trong lúc chờ HR vẫn vào cổng để xem trạng thái và sửa hồ sơ. */
const SignupDone = memo(function SignupDone({ onEnterPortal }: SignupDoneProps) {
  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chúng tôi sẽ xác minh hồ sơ trong 1–2 ngày làm việc và thông báo kết quả cho bạn. Trong lúc chờ, bạn vẫn xem được trạng thái và chỉnh sửa hồ sơ trong cổng nhà tuyển dụng — chưa tìm được ứng viên hay gửi lời mời cho tới khi được duyệt."
        icon="circle-check-bold"
        intent="success"
        title="Đã gửi đăng ký, chờ duyệt"
      />
      <Button fullWidth variant="primary" onClick={onEnterPortal}>
        Vào cổng nhà tuyển dụng
      </Button>
    </div>
  );
});

export default SignupDone;
