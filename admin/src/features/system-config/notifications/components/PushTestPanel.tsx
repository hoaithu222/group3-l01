import { memo } from 'react';

import { useAuthStore } from '@/app/store';
import { BoxPanel } from '@/shared/ui';

import PushTestForm from './PushTestForm';

/**
 * Cổng của công cụ "Gửi push thử" (admin.md p0-06 §2.2, §4 "manager không thấy
 * panel"): chỉ vai `admin` VÀ có `system-config:update` mới thấy panel. Kiểm cả hai
 * dù `admin` vốn vượt mọi quyền chi tiết — khớp BE (`requireRoles([ADMIN])` +
 * `system-config:update`), và tránh ngầm mở cho vai khác nếu quy tắc siêu quyền đổi.
 *
 * Selector trả BOOLEAN (không trả hàm `hasRole`/`hasPermission`) để đổi phiên đăng
 * nhập/quyền thì panel được vẽ lại.
 */
const PushTestPanel = memo(function PushTestPanel() {
  const canSend = useAuthStore(
    (s) => s.hasRole('admin') && s.hasPermission('system-config', 'update'),
  );
  if (!canSend) return null;

  return (
    <BoxPanel border="hairline" className="h-auto" title="Gửi push thử">
      <div className="p-2">
        <PushTestForm />
      </div>
    </BoxPanel>
  );
});

export default PushTestPanel;
