import { memo } from 'react';

import { ConfirmWithReasonModal } from '@/shared/ui';

import { useCancelOrder } from '../../service/o2o-orders.queries';
import type { AdminOrder } from '../../types/o2o.types';

export interface CancelOrderModalProps {
  order: AdminOrder;
  open: boolean;
  onClose: () => void;
}

/**
 * Huỷ đơn khi khiếu nại (admin.md p6-05 §2.3) — CHỈ đơn chưa kết thúc (BE `adminActions.canCancel`); lý do ≥ 10 ký tự vào nhật ký
 * `print.order-cancel-admin`. Đơn ĐÃ GỬI thì cả khách lẫn chủ tiệm được thông báo; đơn nháp chỉ báo khách.
 */
const CancelOrderModal = memo(function CancelOrderModal({
  order,
  open,
  onClose,
}: CancelOrderModalProps) {
  const cancel = useCancelOrder();
  return (
    <ConfirmWithReasonModal
      confirmLabel="Huỷ đơn"
      confirmTone="danger"
      impact={
        order.submittedAt
          ? `Đơn ${order.code} bị huỷ; khách và chủ tiệm đều nhận thông báo. Không hoàn tác được.`
          : `Đơn nháp ${order.code} bị huỷ; khách nhận thông báo. Không hoàn tác được.`
      }
      open={open}
      title="Huỷ đơn in"
      onConfirm={async (reason) => {
        await cancel.mutateAsync({ id: order.id, reason });
        onClose();
      }}
      onOpenChange={(next) => !next && onClose()}
    />
  );
});

export default CancelOrderModal;
