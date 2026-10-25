import { memo, useState } from 'react';

import { Button } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { usePartnerDownload, usePartnerMarkPaid, usePartnerStep } from '../service/partner.queries';
import type { PartnerOrder } from '../types/partner.types';
import PickupDialog from './PickupDialog';
import RejectOrderModal from './RejectOrderModal';

export interface OrderActionsProps {
  order: PartnerOrder;
  size?: 'xs' | 'sm';
  /** Hiện nút "Đã thu tiền" riêng (trang chi tiết). Thẻ hàng đợi tắt — "Giao hàng" đã kèm tick thu tiền. */
  withMarkPaid?: boolean;
}

/**
 * Nút hành động của MỘT đơn — dùng chung cho thẻ hàng đợi và trang chi tiết. CHỈ vẽ nút theo `partnerActions` do server tính
 * (`canAccept`, `canDownload`…), không tự suy từ `status`: quy tắc nghiệp vụ nằm một chỗ ở BE. "Tải tệp" chỉ có khi ACCEPTED/PRINTING
 * (`canDownload`) — ở PENDING nút KHÔNG tồn tại (tiệm không được thấy tệp trước khi nhận đơn). Từ chối/Giao hàng mở hộp thoại,
 * mount khi cần để hàng trăm thẻ không kéo theo hàng trăm form.
 */
const OrderActions = memo(function OrderActions({
  order,
  size = 'sm',
  withMarkPaid = false,
}: OrderActionsProps) {
  const a = order.partnerActions;
  const step = usePartnerStep();
  const download = usePartnerDownload();
  const markPaid = usePartnerMarkPaid();
  const [dialog, setDialog] = useState<'reject' | 'pickup' | null>(null);
  const busy = step.isPending || download.isPending || markPaid.isPending;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {a.canAccept ? (
          <Button
            disabled={busy}
            size={size}
            variant="primary"
            onClick={() => step.mutate({ id: order.id, step: 'accept' })}
          >
            Nhận đơn
          </Button>
        ) : null}
        {a.canReject ? (
          <Button
            disabled={busy}
            size={size}
            skin="danger"
            variant="stroke"
            onClick={() => setDialog('reject')}
          >
            Từ chối
          </Button>
        ) : null}
        {a.canDownload ? (
          <Button
            disabled={busy}
            size={size}
            startIcon={<SystemIcon name="arrow-down-to-bracket-outline" size={14} />}
            variant="stroke"
            onClick={() => download.mutate(order.id)}
          >
            Tải tệp
          </Button>
        ) : null}
        {a.canStartPrinting ? (
          <Button
            disabled={busy}
            size={size}
            variant="primary"
            onClick={() => step.mutate({ id: order.id, step: 'printing' })}
          >
            Bắt đầu in
          </Button>
        ) : null}
        {a.canMarkReady ? (
          <Button
            disabled={busy}
            size={size}
            variant="primary"
            onClick={() => step.mutate({ id: order.id, step: 'ready' })}
          >
            Đã in xong
          </Button>
        ) : null}
        {a.canPickup ? (
          <Button disabled={busy} size={size} variant="primary" onClick={() => setDialog('pickup')}>
            Giao hàng
          </Button>
        ) : null}
        {withMarkPaid && a.canMarkPaid ? (
          <Button
            disabled={busy}
            size={size}
            variant="stroke"
            onClick={() => markPaid.mutate(order.id)}
          >
            Đã thu tiền
          </Button>
        ) : null}
      </div>
      {dialog === 'reject' ? (
        <RejectOrderModal order={order} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'pickup' ? <PickupDialog order={order} onClose={() => setDialog(null)} /> : null}
    </>
  );
});

export default OrderActions;
