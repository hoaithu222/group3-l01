import { memo } from 'react';

import { Drawer, EmptyState, Skeleton } from '@/shared/ui';

import { useAdminShop } from '../../service/o2o-shops.queries';
import ShopDetail from './ShopDetail';

export interface ShopDrawerProps {
  /** `null` = đóng (đồng bộ `?shopId=`). */
  shopId: string | null;
  onClose: () => void;
}

/**
 * Ngăn kéo chi tiết tiệm in (`?shopId=`, deep link `/o2o/shops/:id`). Chỉ tải khi mở; 404 hiện "Không tìm thấy" thay vì toast.
 * Nội dung (kèm số đơn chờ nhận để xác nhận tạm ngưng) ở `ShopDetail`.
 */
const ShopDrawer = memo(function ShopDrawer({ shopId, onClose }: ShopDrawerProps) {
  const { data: shop, isPending, isError, refetch } = useAdminShop(shopId ?? undefined);

  return (
    <Drawer
      open={shopId !== null}
      side="right"
      size="lg"
      title="Tiệm in"
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && shopId !== null ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !shop ? (
        <EmptyState
          description="Tiệm không tồn tại hoặc bạn không còn quyền xem."
          title="Không tìm thấy tiệm in"
        />
      ) : (
        <ShopDetail key={shop.id} shop={shop} onReload={() => void refetch()} />
      )}
    </Drawer>
  );
});

export default ShopDrawer;
