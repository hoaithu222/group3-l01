import { Link } from 'react-router-dom';

import { Badge } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { formatNumber } from '@/shared/utils/format';

import { SHOP_STATUS_META } from '../../constants/o2o.constants';
import { CAPABILITY_KEYS, CAPABILITY_LABELS } from '../../constants/print.constants';
import type { AdminShop } from '../../types/o2o.types';
import StatusBadge from '../shared/StatusBadge';

export interface ShopColumnsOptions {
  /** URL THẬT mở ngăn kéo tiệm (giữ bộ lọc) — Ctrl+click mở tab mới được. */
  hrefFor: (shop: AdminShop) => string;
  onOpen: (shop: AdminShop) => void;
}

/**
 * Cột bảng "Tiệm in" (admin.md p6-05 §2.2): tên tiệm (liên kết mở ngăn kéo) · địa điểm · chủ tiệm (tên + email khi có `user:view`)
 * · năng lực (chỉ chip của năng lực CÓ) · trạng thái duyệt · đơn 30 ngày · nhận đơn (Bật/Tắt bằng chữ).
 */
export function buildShopColumns({
  hrefFor,
  onOpen,
}: ShopColumnsOptions): TableColumn<AdminShop>[] {
  return [
    {
      key: 'name',
      header: 'Tiệm in',
      width: 220,
      cell: (s) => (
        <Link
          className="block truncate text-body-14 text-link hover:underline"
          to={hrefFor(s)}
          onClick={(ev) => {
            if (isModifiedClick(ev)) return;
            ev.preventDefault();
            onOpen(s);
          }}
        >
          {s.displayName}
        </Link>
      ),
    },
    {
      key: 'location',
      header: 'Địa điểm',
      width: 240,
      cell: (s) =>
        s.location ? (
          <div className="min-w-0">
            <div className="truncate">{s.location.name}</div>
            <div className="truncate text-caption-12 text-fg-4">{s.location.address}</div>
          </div>
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
    {
      key: 'owner',
      header: 'Chủ tiệm',
      width: 200,
      cell: (s) => (
        <div className="min-w-0">
          <div className="truncate">{s.owner.name}</div>
          {s.owner.email ? (
            <div className="truncate text-caption-12 text-fg-4">{s.owner.email}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'capabilities',
      header: 'Năng lực',
      width: 220,
      cell: (s) => {
        const on = CAPABILITY_KEYS.filter((k) => s.capabilities[k]);
        return on.length === 0 ? (
          <span className="text-fg-4">Chỉ A4 đen trắng, 1 mặt</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {on.map((k) => (
              <Badge key={k} color="neutral" size="sm" variant="outline">
                {CAPABILITY_LABELS[k]}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 120,
      cell: (s) => <StatusBadge fallback={s.status} meta={SHOP_STATUS_META[s.status]} />,
    },
    {
      key: 'orders30d',
      header: 'Đơn 30 ngày',
      width: 110,
      align: 'right',
      cell: (s) => <span className="tabular-nums">{formatNumber(s.orders30d)}</span>,
    },
    {
      key: 'accepting',
      header: 'Nhận đơn',
      width: 100,
      cell: (s) => (
        <Badge color={s.acceptingOrders ? 'success' : 'neutral'} variant="tinted">
          {s.acceptingOrders ? 'Bật' : 'Tắt'}
        </Badge>
      ),
    },
  ];
}
