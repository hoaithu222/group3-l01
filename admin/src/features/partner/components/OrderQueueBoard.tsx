import { memo, useMemo } from 'react';

import { ListLoadError } from '@/features/o2o';
import { useNowTick } from '@/shared/hooks';
import { Button, EmptyState, Skeleton } from '@/shared/ui';

import { QUEUE_COLUMNS } from '../constants/partner.constants';
import { usePartnerQueue, usePartnerShops } from '../service/partner.queries';
import { groupByStatus } from '../utils/partner-order.utils';
import OrderQueueColumn from './OrderQueueColumn';

/**
 * Bảng Kanban nhẹ của hàng đợi (admin.md p6-05 §2.4): bốn cột Mới · Đã nhận · Đang in · Sẵn sàng, đơn chờ LÂU NHẤT lên đầu mỗi cột.
 * Đọc `GET /partner/orders?status=…` (cursor) — hết đơn của trang đầu mà còn nữa thì có "Tải thêm". Tải → `Skeleton`; chưa có đơn nào → `EmptyState` "Chưa có đơn mới"; lỗi khi chưa có
 * dữ liệu → `Callout` + "Thử lại" (không vẽ bốn cột rỗng như thể không có đơn); đã có dữ liệu rồi mới lỗi nền thì giữ nguyên bảng.
 * Đồng hồ "đã chờ" nhích mỗi phút. Chủ sở hữu NHIỀU tiệm thì thẻ ghi thêm tên tiệm.
 */
const OrderQueueBoard = memo(function OrderQueueBoard() {
  const q = usePartnerQueue();
  const { data: shops } = usePartnerShops();
  const { now } = useNowTick(60_000);
  const orders = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  const groups = useMemo(() => groupByStatus(orders), [orders]);
  const shopNames = useMemo(
    () =>
      shops && shops.length > 1 ? new Map(shops.map((s) => [s.id, s.displayName])) : undefined,
    [shops],
  );

  if (q.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {QUEUE_COLUMNS.map((c) => (
          <Skeleton key={c.status} className="h-32 w-full" />
        ))}
      </div>
    );
  }
  if (q.isError && !q.data) {
    return (
      <ListLoadError
        error={q.error}
        title="Không tải được hàng đợi đơn in"
        onRetry={() => void q.refetch()}
      />
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        description="Đơn khách gửi sẽ hiện ở đây ngay khi có — không cần tải lại trang."
        title="Chưa có đơn mới"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {QUEUE_COLUMNS.map((c) => (
          <OrderQueueColumn
            key={c.status}
            empty={c.empty}
            nowMs={now.getTime()}
            orders={groups[c.status]}
            shopNames={shopNames}
            title={c.title}
          />
        ))}
      </div>
      {q.hasNextPage ? (
        <Button
          className="self-center"
          disabled={q.isFetchingNextPage}
          size="sm"
          variant="stroke"
          onClick={() => void q.fetchNextPage()}
        >
          Tải thêm đơn
        </Button>
      ) : null}
    </div>
  );
});

export default OrderQueueBoard;
