import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Skeleton, Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatCurrency, formatDate } from '@/shared/utils/format';

import { RECENT_ORDERS_LIMIT } from '../../constants/o2o.constants';
import { PRINT_ORDER_STATUS_META } from '../../constants/print.constants';
import { useAdminOrders } from '../../service/o2o-orders.queries';
import type { AdminOrder } from '../../types/o2o.types';
import ListLoadError from '../shared/ListLoadError';
import StatusBadge from '../shared/StatusBadge';

export interface ShopRecentOrdersProps {
  shopId: string;
}

/** Tab "Đơn gần đây" của ngăn kéo tiệm: 10 đơn mới nhất của tiệm (mã là liên kết sang tab Đơn in, mở ngăn kéo đơn). */
const ShopRecentOrders = memo(function ShopRecentOrders({ shopId }: ShopRecentOrdersProps) {
  const { data, error, isPending, isError, refetch } = useAdminOrders({
    page: 1,
    limit: RECENT_ORDERS_LIMIT,
    shopId,
  });
  const columns = useMemo<TableColumn<AdminOrder>[]>(
    () => [
      {
        key: 'code',
        header: 'Mã đơn',
        width: 120,
        cell: (o) => (
          <Link
            className="font-mono text-body-14 text-link hover:underline"
            to={{ search: `?tab=orders&orderId=${o.id}` }}
          >
            {o.code}
          </Link>
        ),
      },
      {
        key: 'status',
        header: 'Trạng thái',
        width: 130,
        cell: (o) => <StatusBadge fallback={o.status} meta={PRINT_ORDER_STATUS_META[o.status]} />,
      },
      {
        key: 'total',
        header: 'Tổng',
        width: 110,
        align: 'right',
        cell: (o) => (
          <span className="tabular-nums">{o.quote ? formatCurrency(o.quote.total) : '—'}</span>
        ),
      },
      {
        key: 'createdAt',
        header: 'Tạo lúc',
        width: 130,
        cell: (o) => (
          <span className="tabular-nums text-caption-12">
            {formatDate(o.createdAt, 'HH:mm DD/MM/YYYY')}
          </span>
        ),
      },
    ],
    [],
  );

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (isError && !data) {
    return (
      <ListLoadError
        error={error}
        title="Không tải được đơn của tiệm"
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Table
        columns={columns}
        data={data?.data ?? []}
        emptyMessage="Tiệm chưa có đơn nào"
        pagination={false}
        rowKey={(o) => o.id}
      />
      {(data?.meta?.total ?? 0) > RECENT_ORDERS_LIMIT ? (
        <Text size="tiny" skin="muted">
          Hiện {RECENT_ORDERS_LIMIT} đơn mới nhất trong tổng {data?.meta?.total} đơn — xem đủ ở tab
          "Đơn in" (lọc theo tiệm).
        </Text>
      ) : null}
    </div>
  );
});

export default ShopRecentOrders;
