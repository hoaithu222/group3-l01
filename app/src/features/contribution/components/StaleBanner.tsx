import { Alert } from '@/shared/ui/alert';

import { formatDateTimeIn } from '../utils/zoned-format';

export interface StaleBannerProps {
  /** ISO — lần tính sẵn gần nhất; `null` khi chưa từng tính. */
  computedAt: string | null;
  timezone: string;
}

/**
 * Báo cáo `stale: true` (app.md §3): còn thay đổi chưa vào bản tính sẵn, server đang tính lại. Số vẫn hiện (đúng tới lúc tính lần cuối) và màn tự tải
 * lại MỘT lần sau 60 giây (`useStaleRefetch`) — người dùng cũng kéo để làm mới được. Không phải lỗi nên là `info`, không chặn thao tác nào.
 */
export function StaleBanner({ computedAt, timezone }: StaleBannerProps) {
  const last = computedAt ? formatDateTimeIn(computedAt, timezone) : '';

  return (
    <Alert
      description={last ? `Đang cập nhật số liệu (tính lần cuối ${last}).` : 'Đang cập nhật số liệu.'}
      tone="info"
    />
  );
}
