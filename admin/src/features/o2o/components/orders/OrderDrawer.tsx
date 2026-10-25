import { memo } from 'react';

import { Drawer, EmptyState, Skeleton } from '@/shared/ui';

import { useAdminOrder } from '../../service/o2o-orders.queries';
import OrderDetail from './OrderDetail';

export interface OrderDrawerProps {
  /** `null` = đóng (đồng bộ `?orderId=`). */
  orderId: string | null;
  onClose: () => void;
}

/**
 * Ngăn kéo chi tiết đơn in (`?orderId=`, deep link `/o2o/orders/:id`). Chỉ tải khi mở; 404 hiện "Không tìm thấy" thay vì toast.
 * Nội dung ở `OrderDetail` (không PIN, không tệp).
 */
const OrderDrawer = memo(function OrderDrawer({ orderId, onClose }: OrderDrawerProps) {
  const { data: order, isPending, isError } = useAdminOrder(orderId ?? undefined);

  return (
    <Drawer
      open={orderId !== null}
      side="right"
      size="lg"
      title="Đơn in"
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && orderId !== null ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !order ? (
        <EmptyState
          description="Đơn không tồn tại hoặc bạn không còn quyền xem."
          title="Không tìm thấy đơn in"
        />
      ) : (
        <OrderDetail key={order.id} order={order} />
      )}
    </Drawer>
  );
});

export default OrderDrawer;
