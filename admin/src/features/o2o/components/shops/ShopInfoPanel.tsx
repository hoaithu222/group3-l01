import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Callout } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import type { AdminShopDetail } from '../../types/o2o.types';
import Fact from '../shared/Fact';

export interface ShopInfoPanelProps {
  shop: AdminShopDetail;
}

const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm DD/MM/YYYY') : '—');

/**
 * Tab "Thông tin" của ngăn kéo tiệm (admin.md p6-05 §2.2): chủ tiệm (email chỉ khi có `user:view` — BE bỏ khi thiếu) · điện thoại ·
 * địa điểm (liên kết sang tab Địa điểm) · nhận đơn · số đơn 30 ngày / đang chờ nhận · mốc duyệt. Tiệm tạm ngưng hiện lý do.
 */
const ShopInfoPanel = memo(function ShopInfoPanel({ shop }: ShopInfoPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {shop.status === 'SUSPENDED' && shop.suspendedReason ? (
        <Callout description={shop.suspendedReason} intent="warning" title="Tiệm đang tạm ngưng" />
      ) : null}
      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Chủ tiệm">{shop.owner.name}</Fact>
        <Fact label="Email chủ tiệm">
          {shop.owner.email ?? (
            <span className="text-fg-4">Không hiện (thiếu quyền xem người dùng)</span>
          )}
        </Fact>
        <Fact label="Điện thoại">{shop.phone ?? <span className="text-fg-4">—</span>}</Fact>
        <Fact label="Nhận đơn">{shop.acceptingOrders ? 'Đang bật' : 'Đang tắt'}</Fact>
        <Fact label="Địa điểm" wide>
          {shop.location ? (
            <>
              <Link
                className="text-link hover:underline"
                to={{ search: `?tab=locations&locationId=${shop.locationId}` }}
              >
                {shop.location.name}
              </Link>
              <div className="text-caption-12 text-fg-4">{shop.location.address}</div>
            </>
          ) : (
            <span className="text-fg-4">—</span>
          )}
        </Fact>
        <Fact label="Đơn 30 ngày qua">
          <span className="tabular-nums">{formatNumber(shop.orders30d)}</span>
        </Fact>
        <Fact label="Đơn đang chờ nhận">
          <span className="tabular-nums">{formatNumber(shop.pendingOrders)}</span>
        </Fact>
        <Fact label="Duyệt lúc">{when(shop.approvedAt)}</Fact>
        <Fact label="Tạo lúc">{when(shop.createdAt)}</Fact>
      </dl>
    </div>
  );
});

export default ShopInfoPanel;
