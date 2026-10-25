import { memo } from 'react';
import { Link } from 'react-router-dom';

import {
  formatPagesTimesCopies,
  formatPrintSettings,
  PRINT_PAYMENT_META,
  StatusBadge,
} from '@/features/o2o';
import { Surface, Text } from '@/shared/ui';
import { formatCurrency, formatDate } from '@/shared/utils/format';

import type { PartnerOrder } from '../types/partner.types';
import { formatWaiting } from '../utils/partner-order.utils';
import OrderActions from './OrderActions';

export interface OrderCardProps {
  order: PartnerOrder;
  /** Mốc "bây giờ" (ms) do bảng truyền xuống — một nhịp cho mọi thẻ thay vì mỗi thẻ một đồng hồ. */
  nowMs: number;
  /** Tên tiệm — chỉ truyền khi chủ sở hữu nhiều tiệm (để biết đơn của tiệm nào). */
  shopName?: string;
}

/**
 * Thẻ đơn trong hàng đợi (admin.md p6-05 §2.4): mã (liên kết tới chi tiết) · thanh toán · khách (TÊN) · trang × bản · màu/2 mặt/khổ ·
 * tổng tiền · hẹn lấy · thời gian đã chờ · nút hành động (`OrderActions`). Không PIN, không tên tệp gốc.
 */
const OrderCard = memo(function OrderCard({ order, nowMs, shopName }: OrderCardProps) {
  return (
    <Surface className="flex flex-col gap-2" padding="md" rounded>
      <div className="flex items-start justify-between gap-2">
        <Link
          className="font-mono text-body-14 text-link hover:underline"
          to={`orders/${encodeURIComponent(order.id)}`}
        >
          {order.code}
        </Link>
        <StatusBadge
          fallback={order.payment.status}
          meta={PRINT_PAYMENT_META[order.payment.status]}
        />
      </div>
      <div className="min-w-0 text-body-14 text-fg-1">
        <div className="truncate">
          {order.customer.name}
          {shopName ? <span className="text-fg-4"> · {shopName}</span> : null}
        </div>
        <div className="tabular-nums">{formatPagesTimesCopies(order)}</div>
        <div className="text-caption-12 text-fg-3">{formatPrintSettings(order.settings)}</div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="tabular-nums text-body-16-semibold">
          {order.quote ? formatCurrency(order.quote.total) : '—'}
        </span>
        <Text size="tiny" skin="muted">
          Đã chờ {formatWaiting(order, nowMs)}
        </Text>
      </div>
      {order.pickupBy ? (
        <Text size="tiny" skin="muted">
          Hẹn lấy: <span className="tabular-nums">{formatDate(order.pickupBy, 'HH:mm DD/MM')}</span>
        </Text>
      ) : null}
      <OrderActions order={order} size="xs" />
    </Surface>
  );
});

export default OrderCard;
