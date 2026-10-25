import { memo } from 'react';

import ConfigGroupList from '../components/ConfigGroupList';
import NotificationStatsPanel from './components/NotificationStatsPanel';
import PushProviderCard from './components/PushProviderCard';
import PushStatsStrip from './components/PushStatsStrip';
import PushTestPanel from './components/PushTestPanel';

/**
 * Tab "Thông báo" của trang `system-config` (admin.md p0-06 §2 + p1-07 §2.1): mặc định thông
 * báo (khoá registry `notification.defaults` — form sinh từ metadata BE, có hộp thoại lý do),
 * trạng thái nhà cung cấp push, số liệu push (p0-06: DB) + số liệu thông báo tin nhắn gộp 24 giờ/7
 * ngày (p1-07: bộ đếm Redis) và công cụ "Gửi push thử".
 *
 * Các ô plan còn lại (cửa sổ gộp push, giữ hộp thư, lô fan-out, số thiết bị tối đa, giữ số liệu)
 * là `LIMITS.notification` — KHÔNG nằm trong registry `/admin/system-config` nên không sửa được ở
 * form. BE trả chúng ở `limits` của `GET /admin/notifications/stats`; `NotificationStatsPanel` vẽ
 * thành khối "Giới hạn (chỉ đọc)" (`NotificationLimitsList`, ẩn khi BE cũ chưa trả). Muốn sửa được
 * thì thêm khoá `notification.*` vào registry BE — form tự có thêm ô.
 */
const NotificationsTab = memo(function NotificationsTab() {
  return (
    <div className="flex flex-col gap-2">
      <ConfigGroupList hideWhenEmpty tab="notifications" tabLabel="thông báo" />
      <PushProviderCard />
      <PushStatsStrip />
      <NotificationStatsPanel />
      <PushTestPanel />
    </div>
  );
});

export default NotificationsTab;
