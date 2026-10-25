import { memo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, ConfirmWithReasonModal } from '@/shared/ui';

import { useApproveShop, useSuspendShop, useUpdateShop } from '../../service/o2o-shops.queries';
import type { AdminShopDetail } from '../../types/o2o.types';
import { suspendImpact } from '../../utils/shop.utils';

type ShopAction = 'approve' | 'suspend' | 'accepting';

export interface ShopStatusActionsProps {
  shop: AdminShopDetail;
}

/**
 * Nút hành động trạng thái của tiệm + hộp xác nhận có lý do: **Duyệt** (`o2o:approve`; từ Chờ duyệt / Tạm ngưng), **Tạm ngưng**
 * (`o2o:update`; từ Chờ duyệt / Đã duyệt; nêu số đơn chờ nhận bị ảnh hưởng), **Bật/Tắt nhận đơn** (`o2o:update`; chỉ tiệm đã duyệt).
 * Mọi thao tác ghi lý do vào nhật ký quản trị.
 */
const ShopStatusActions = memo(function ShopStatusActions({ shop }: ShopStatusActionsProps) {
  const canApprove = useAuthStore((s) => s.hasPermission('o2o', 'approve'));
  const canUpdate = useAuthStore((s) => s.hasPermission('o2o', 'update'));
  const [action, setAction] = useState<ShopAction | null>(null);
  const approve = useApproveShop();
  const suspend = useSuspendShop();
  const update = useUpdateShop();

  const canBeApproved = shop.status === 'PENDING' || shop.status === 'SUSPENDED';
  const canBeSuspended = shop.status === 'PENDING' || shop.status === 'APPROVED';

  const handleConfirm = async (reason: string) => {
    if (action === 'approve') await approve.mutateAsync({ id: shop.id, reason });
    else if (action === 'suspend') await suspend.mutateAsync({ id: shop.id, reason });
    else if (action === 'accepting') {
      await update.mutateAsync({
        id: shop.id,
        expectedVersion: shop.version,
        acceptingOrders: !shop.acceptingOrders,
        reason,
      });
    }
    setAction(null);
  };

  const copy = {
    approve: {
      title: shop.status === 'SUSPENDED' ? 'Duyệt lại tiệm in' : 'Duyệt tiệm in',
      impact: `Chủ tiệm (${shop.owner.name}) có quyền vào cổng tiệm in trong tối đa 60 giây và bắt đầu nhận đơn (khi đang bật "Nhận đơn").`,
      tone: 'primary' as const,
    },
    suspend: {
      title: 'Tạm ngưng tiệm in',
      impact: suspendImpact(shop.pendingOrders),
      tone: 'danger' as const,
    },
    accepting: {
      title: shop.acceptingOrders ? 'Tắt nhận đơn' : 'Bật nhận đơn',
      impact: shop.acceptingOrders
        ? 'Khách không đặt được đơn mới ở tiệm này; đơn đang xử lý không đổi.'
        : 'Khách đặt được đơn mới ở tiệm này.',
      tone: shop.acceptingOrders ? ('danger' as const) : ('primary' as const),
    },
  };
  const current = action ? copy[action] : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canApprove && canBeApproved ? (
          <Button size="sm" variant="primary" onClick={() => setAction('approve')}>
            {shop.status === 'SUSPENDED' ? 'Duyệt lại' : 'Duyệt tiệm'}
          </Button>
        ) : null}
        {canUpdate && shop.status === 'APPROVED' ? (
          <Button size="sm" variant="stroke" onClick={() => setAction('accepting')}>
            {shop.acceptingOrders ? 'Tắt nhận đơn' : 'Bật nhận đơn'}
          </Button>
        ) : null}
        {canUpdate && canBeSuspended ? (
          <Button size="sm" skin="danger" variant="stroke" onClick={() => setAction('suspend')}>
            Tạm ngưng
          </Button>
        ) : null}
      </div>
      <ConfirmWithReasonModal
        confirmTone={current?.tone}
        impact={current?.impact ?? null}
        open={action !== null}
        title={current?.title ?? ''}
        onConfirm={handleConfirm}
        onOpenChange={(open) => !open && setAction(null)}
      />
    </>
  );
});

export default ShopStatusActions;
