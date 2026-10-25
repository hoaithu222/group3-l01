import { memo } from 'react';

import OrderQueueBoard from './OrderQueueBoard';
import ShopStatusBanner from './ShopStatusBanner';

/**
 * Tab "Đơn hàng" của cổng chủ tiệm (admin.md p6-05 §2.4): banner trạng thái tiệm (nếu có vấn đề) + hàng đợi Kanban. Cảnh báo đơn mới
 * (socket, âm báo, tiêu đề tab) do `usePartnerAlerts` ở `PartnerPage` lo để chạy trên mọi tab.
 */
const PartnerQueueTab = memo(function PartnerQueueTab() {
  return (
    <div className="flex flex-col gap-3">
      <ShopStatusBanner />
      <OrderQueueBoard />
    </div>
  );
});

export default PartnerQueueTab;
