import { memo } from 'react';

import { ConfirmWithReasonModal } from '@/shared/ui';

import { REJECT_REASON_MAX, REJECT_REASON_MIN } from '../constants/partner.constants';
import { usePartnerReject } from '../service/partner.queries';
import type { PartnerOrder } from '../types/partner.types';

export interface RejectOrderModalProps {
  order: PartnerOrder;
  onClose: () => void;
}

/**
 * Từ chối đơn (admin.md p6-05 §2.4): lý do BẮT BUỘC 3–200 ký tự (`partnerRejectSchema` BE — ngắn hơn lý do quản trị 10 ký tự vì
 * chủ tiệm cần bấm nhanh giữa giờ đông khách) và khách nhận thông báo kèm lý do này. Nơi gọi chỉ mount khi mở.
 */
const RejectOrderModal = memo(function RejectOrderModal({ order, onClose }: RejectOrderModalProps) {
  const reject = usePartnerReject();
  return (
    <ConfirmWithReasonModal
      confirmLabel="Từ chối đơn"
      confirmTone="danger"
      impact={`Từ chối đơn ${order.code}: khách nhận thông báo kèm lý do bạn ghi. Không hoàn tác được.`}
      maxReasonLength={REJECT_REASON_MAX}
      minReasonLength={REJECT_REASON_MIN}
      open
      title="Từ chối đơn in"
      onConfirm={async (reason) => {
        await reject.mutateAsync({ id: order.id, reason });
        onClose();
      }}
      onOpenChange={(next) => !next && onClose()}
    />
  );
});

export default RejectOrderModal;
