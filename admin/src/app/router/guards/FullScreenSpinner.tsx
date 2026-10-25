import { memo } from 'react';

import { Spinner } from '@/shared/ui';

/** Toàn màn hình, chờ khôi phục phiên — guard KHÔNG được để lộ trang đăng nhập/nội dung trong lúc này. */
const FullScreenSpinner = memo(function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-base">
      <Spinner label="Đang khôi phục phiên đăng nhập" size="lg" />
    </div>
  );
});

export default FullScreenSpinner;
