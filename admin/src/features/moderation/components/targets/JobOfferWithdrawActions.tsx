import { memo } from 'react';

import { useDisclosure } from '@/shared/hooks';
import { BoxPanel, Button, Callout, ConfirmWithReasonModal } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { OFFER_INVALID_STATE_CODE } from '../../service/recruiter-moderation.api';
import { useWithdrawOffer } from '../../service/recruiter-moderation.queries';
import type { ReportedOffer } from '../../types/recruiter-moderation.types';
import { errorCodeOf } from '../../utils/report-errors';

export interface JobOfferWithdrawActionsProps {
  offer: ReportedOffer;
  /** `recruiter:approve` — thu hồi lời mời vi phạm; thiếu thì khối không hiện. */
  canWithdraw: boolean;
}

/** Lời mời còn "mở" (BE `OPEN_OFFER_STATUSES`) — chỉ khi đó mới thu hồi được. */
const OPEN_STATUSES: readonly ReportedOffer['status'][] = ['SENT', 'READ', 'INTERESTED'];

const IMPACT =
  'Lời mời chuyển sang "Đã thu hồi" và khoá trao đổi ngay; không hoàn lại lượt gửi của doanh nghiệp. Mọi báo cáo đang mở về lời mời này được đóng (kết quả "Đã gỡ nội dung"). Hành động này ghi nhật ký quản trị.';

/**
 * Khối "Xử lý lời mời" (p6-08, admin.md §2.3): **Thu hồi lời mời** — `recruiter:approve`, lý do ≥ 10 ký tự (`ConfirmWithReasonModal`), BE ghi audit `job-offer.admin-withdraw`.
 * Đứng riêng khỏi `ReportDecisionBar` (Bỏ qua · Cảnh cáo) vì thu hồi đóng luôn báo cáo mở và là thao tác lên CHÍNH lời mời chứ không lên báo cáo.
 * Lời mời đã đóng (thu hồi/từ chối/hết hạn) → chỉ báo trạng thái, không nút. `RECR_009` (người khác vừa thu hồi) → đóng hộp thoại thay vì kẹt.
 */
const JobOfferWithdrawActions = memo(function JobOfferWithdrawActions({
  offer,
  canWithdraw,
}: JobOfferWithdrawActionsProps) {
  const { close, isOpen, open } = useDisclosure();
  const withdraw = useWithdrawOffer();

  if (!canWithdraw) return null;
  const isOpenOffer = OPEN_STATUSES.includes(offer.status);

  return (
    <BoxPanel border="hairline" title="Xử lý lời mời">
      <div className="flex flex-col gap-2 p-3">
        {isOpenOffer ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              skin="danger"
              startIcon={<SystemIcon name="ban-outline" size={14} />}
              variant="stroke"
              onClick={open}
            >
              Thu hồi lời mời
            </Button>
          </div>
        ) : (
          <Callout
            description="Lời mời không còn ở trạng thái mở nên không cần thu hồi."
            intent="neutral"
          />
        )}
      </div>
      <ConfirmWithReasonModal
        confirmLabel="Thu hồi lời mời"
        confirmTone="danger"
        impact={IMPACT}
        open={isOpen}
        title={`Thu hồi lời mời — ${offer.company.name || 'doanh nghiệp'}`}
        onConfirm={async (reason) => {
          try {
            await withdraw.mutateAsync({ offerId: offer.id, reason });
          } catch (err) {
            // `RECR_009`: lời mời không còn mở — hành động không bao giờ thành công được nữa; interceptor đã toast, hook đã làm mới hàng đợi.
            if (errorCodeOf(err) !== OFFER_INVALID_STATE_CODE) throw err;
          }
          close();
        }}
        onOpenChange={(next) => (next ? open() : close())}
      />
    </BoxPanel>
  );
});

export default JobOfferWithdrawActions;
