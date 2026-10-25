import { memo, useEffect, useState } from 'react';

import { useNowTick } from '@/shared/hooks';
import { Callout } from '@/shared/ui';

import { formatCountdown } from '../utils/portal-errors';

export interface ViewLimitBannerProps {
  /** Số giây còn lại lúc nhận `RECR_010` (`details.retryAfterSeconds`); `null` khi BE không báo. */
  seconds: number | null;
  /** Gọi đúng MỘT lần khi đếm về 0:00 — trang gỡ banner và cho xem hồ sơ trở lại. */
  onExpire: () => void;
}

/**
 * Banner giới hạn xem hồ sơ trong ngày (`429 RECR_010`, trần 300 lượt/ngày/HR — admin.md p6-08 §2.4): đếm ngược tới 0:00 rồi tự gỡ. BE không báo được thời điểm mở lại
 * thì hiện thông điệp không đồng hồ (không bịa mốc giờ). Mount MỚI mỗi lần chạm giới hạn (`key` ở nơi dùng) để đồng hồ luôn tính từ lần đó.
 */
const ViewLimitBanner = memo(function ViewLimitBanner({ seconds, onExpire }: ViewLimitBannerProps) {
  const [endsAt] = useState(() => (seconds === null ? null : Date.now() + seconds * 1000));
  const { now } = useNowTick(1000);
  const remaining = endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now.getTime()) / 1000));
  const expired = remaining === 0;

  useEffect(() => {
    if (expired) onExpire();
  }, [expired, onExpire]);

  return (
    <Callout
      description={
        remaining === null
          ? 'Bạn đã xem tối đa số hồ sơ cho phép hôm nay. Quay lại sau để xem tiếp.'
          : `Bạn đã xem tối đa số hồ sơ cho phép hôm nay. Có thể xem tiếp sau ${formatCountdown(remaining)}.`
      }
      icon="clock-bold"
      intent="warning"
      title="Đã đạt giới hạn xem hồ sơ trong ngày"
    />
  );
});

export default ViewLimitBanner;
