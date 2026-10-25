import { memo } from 'react';

import { Callout } from '@/shared/ui';

import MarketplaceSettings from './MarketplaceSettings';
import PendingListingTable from './PendingListingTable';
import ReportedListingTable from './ReportedListingTable';

/**
 * Sub-tab "Chợ" (admin.md p7-02 §2.1): cấu hình bật/tắt + phí + cấp tối thiểu, tin chờ duyệt (`gamification:update`), tin bị báo cáo
 * (`moderation:update` — xem ghi chú ở `ReportedListingTable` về lý do KHÔNG dùng hàng đợi Kiểm duyệt chung).
 */
const MarketplaceSection = memo(function MarketplaceSection() {
  return (
    <div className="flex flex-col gap-4">
      <Callout
        description="Study set bán được đã ở chế độ PUBLIC — mua chủ yếu để ủng hộ người tạo và nhận một bản sao riêng, chưa thay cho quyền sở hữu nội dung. Tài liệu cá nhân (RESOURCE) BE đã hỗ trợ đầy đủ; app hiện chỉ cho niêm yết bộ học qua giao diện."
        intent="info"
        variant="ghost"
      />
      <MarketplaceSettings />
      <PendingListingTable />
      <ReportedListingTable />
    </div>
  );
});

export default MarketplaceSection;
