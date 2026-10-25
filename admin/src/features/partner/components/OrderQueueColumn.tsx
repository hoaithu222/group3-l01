import { memo } from 'react';

import { Badge, Text } from '@/shared/ui';

import type { PartnerOrder } from '../types/partner.types';
import OrderCard from './OrderCard';

export interface OrderQueueColumnProps {
  title: string;
  /** Câu hiện khi cột rỗng ("Chưa có đơn mới"). */
  empty: string;
  orders: readonly PartnerOrder[];
  nowMs: number;
  /** id tiệm → tên, CHỈ truyền khi chủ sở hữu nhiều tiệm. */
  shopNames?: ReadonlyMap<string, string>;
}

/** Một cột Kanban của hàng đợi: tiêu đề + số đơn, thẻ xếp từ đơn chờ LÂU NHẤT xuống, hoặc câu "chưa có đơn". */
const OrderQueueColumn = memo(function OrderQueueColumn({
  title,
  empty,
  orders,
  nowMs,
  shopNames,
}: OrderQueueColumnProps) {
  return (
    <section aria-label={`Cột ${title}`} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Text size="small" weight="medium">
          {title}
        </Text>
        <Badge color={orders.length > 0 ? 'primary' : 'neutral'} size="sm" variant="tinted">
          {orders.length}
        </Badge>
      </div>
      {orders.length === 0 ? (
        <Text size="small" skin="muted">
          {empty}
        </Text>
      ) : (
        orders.map((o) => (
          <OrderCard key={o.id} nowMs={nowMs} order={o} shopName={shopNames?.get(o.shopId)} />
        ))
      )}
    </section>
  );
});

export default OrderQueueColumn;
