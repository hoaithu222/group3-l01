import { memo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Tabs } from '@/shared/ui';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import { SHOP_STATUS_META } from '../../constants/o2o.constants';
import type { AdminShopDetail } from '../../types/o2o.types';
import StatusBadge from '../shared/StatusBadge';
import ShopInfoPanel from './ShopInfoPanel';
import ShopPriceForm from './ShopPriceForm';
import ShopRecentOrders from './ShopRecentOrders';
import ShopStatusActions from './ShopStatusActions';

type DetailTab = 'info' | 'price' | 'orders' | 'audit';

const TABS = [
  { key: 'info', label: 'Thông tin' },
  { key: 'price', label: 'Bảng giá' },
  { key: 'orders', label: 'Đơn gần đây' },
  { key: 'audit', label: 'Nhật ký' },
];

export interface ShopDetailProps {
  shop: AdminShopDetail;
  /** Tải lại chi tiết (sau 409 `RES_003` ở form bảng giá). */
  onReload: () => void;
}

/**
 * Nội dung ngăn kéo tiệm (admin.md p6-05 §2.2): tên + trạng thái duyệt + nút Duyệt/Tạm ngưng/Nhận đơn, bốn tab Thông tin · Bảng giá ·
 * Đơn gần đây · Nhật ký (audit target `PrintShop`). Nơi gọi đặt `key={shop.id}` để đổi tiệm là về tab Thông tin.
 */
const ShopDetail = memo(function ShopDetail({ shop, onReload }: ShopDetailProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('o2o', 'update'));
  const [tab, setTab] = useState<DetailTab>('info');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 truncate text-body-16-semibold text-fg-1">{shop.displayName}</div>
          <StatusBadge fallback={shop.status} meta={SHOP_STATUS_META[shop.status]} />
        </div>
        <ShopStatusActions shop={shop} />
      </div>
      <Tabs
        aria-label="Chi tiết tiệm in"
        options={TABS}
        size="sm"
        value={tab}
        onValueChange={(v) => setTab(v as DetailTab)}
      />
      {tab === 'info' ? <ShopInfoPanel shop={shop} /> : null}
      {tab === 'price' ? (
        <ShopPriceForm key={shop.version} canEdit={canUpdate} shop={shop} onReload={onReload} />
      ) : null}
      {tab === 'orders' ? <ShopRecentOrders shopId={shop.id} /> : null}
      {tab === 'audit' ? <AuditTrailPanel targetId={shop.id} targetType="PrintShop" /> : null}
    </div>
  );
});

export default ShopDetail;
