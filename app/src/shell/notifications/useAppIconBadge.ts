import { useEffect } from 'react';

import { setAppBadgeCount } from '@/core/notifications';

import { useUnreadSummary } from './useUnreadSummary';

/**
 * Số trên icon app = `badgeTotal` của server (p1-07 `app.md` §4.1, §5) — hội thoại chưa đọc không tắt tiếng + mục
 * Hoạt động chưa đọc. Push đặt số lúc GỬI (iOS `aps.badge`); hook này đặt lại số chuẩn mỗi khi tóm tắt đổi (mở app,
 * đọc ở máy khác) — hai nguồn cùng một công thức phía server nên không giật.
 *
 * Mount MỘT lần ở `(app)/_layout`. Đăng xuất: `wipeLocalPushState` đưa về 0 (NT-07) — hook chỉ chạy khi có phiên.
 */
export function useAppIconBadge(): void {
  const badgeTotal = useUnreadSummary().data?.badgeTotal;

  useEffect(() => {
    if (badgeTotal !== undefined) void setAppBadgeCount(badgeTotal);
  }, [badgeTotal]);
}
