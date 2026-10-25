import { memo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { useDisclosure } from '@/shared/hooks';
import { BoxPanel, Button, Callout, ConfirmDialog, EmptyState, Skeleton } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { useReportedOffer } from '../../service/recruiter-moderation.queries';
import type { AdminReportGroup } from '../../types/moderation.types';
import { isReportUnavailable } from '../../utils/report-errors';
import JobOfferReportContext from './JobOfferReportContext';
import JobOfferWithdrawActions from './JobOfferWithdrawActions';

export interface JobOfferTargetPanelProps {
  /** Nhóm báo cáo có `targetType = JOB_OFFER` — `targetId` là id lời mời. */
  group: AdminReportGroup;
}

/**
 * Phần riêng của báo cáo `JOB_OFFER` trên trang chi tiết (p6-08, admin.md §2.3): cổng xác nhận → nội dung lời mời bị báo cáo → thu hồi. Theo D-06, mỗi lần BE trả
 * nội dung lời mời là MỘT dòng nhật ký `job-offer.view-reported`, nên cùng khuôn với `PrivateContentGate`: thiếu `recruiter:approve` chỉ có lời giải thích;
 * đủ quyền thì phải bấm xác nhận rồi MỚI gọi BE (không tự tải khi mở trang). Lời mời không còn (404) → nói rõ, KHÔNG "Thử lại"; mất mạng/5xx → Callout + "Xem lại".
 * Trạng thái "đã xác nhận" là `useState` cục bộ (`key` theo `:id` ở trang) nên đổi báo cáo là mất — xem lại phải xác nhận lại.
 */
const JobOfferTargetPanel = memo(function JobOfferTargetPanel({ group }: JobOfferTargetPanelProps) {
  const canApprove = useAuthStore((s) => s.hasPermission('recruiter', 'approve'));
  const [confirmed, setConfirmed] = useState(false);
  const confirmDialog = useDisclosure();
  const { data: offer, isLoading, isError, error } = useReportedOffer(group.targetId, confirmed && canApprove);

  if (!canApprove) {
    return (
      <Callout
        description="Bạn không có quyền xem nội dung lời mời tuyển dụng bị báo cáo (cần quyền duyệt tuyển dụng). Trang này chỉ hiển thị thông tin mô tả báo cáo."
        icon="lock-bold"
        intent="warning"
        title="Nội dung lời mời thuộc phạm vi riêng tư"
      />
    );
  }

  if (!confirmed) {
    return (
      <>
        <Callout
          action={
            <Button
              size="sm"
              startIcon={<SystemIcon name="eye-outline" size={14} />}
              variant="stroke"
              onClick={confirmDialog.open}
            >
              Xem nội dung lời mời (được ghi nhật ký)
            </Button>
          }
          description="Nội dung chỉ được mở khi cần xử lý báo cáo. Mỗi lần xem đều được ghi vào nhật ký quản trị."
          icon="lock-bold"
          intent="info"
          title="Nội dung lời mời thuộc phạm vi riêng tư"
        />
        <ConfirmDialog
          actionLabel="Xác nhận và xem"
          description="Hành động này được ghi vào nhật ký quản trị. Bạn chỉ thấy nội dung lời mời bị báo cáo — không có trao đổi hay thông tin người nhận."
          open={confirmDialog.isOpen}
          recommendation="Chỉ xem khi cần để xử lý báo cáo."
          title="Xem nội dung lời mời?"
          variant="warning"
          onConfirm={() => setConfirmed(true)}
          onOpenChange={(next) => !next && confirmDialog.close()}
        />
      </>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (isError || !offer) {
    if (isReportUnavailable(error)) {
      return (
        <BoxPanel border="hairline" title="Lời mời bị báo cáo">
          <EmptyState
            description="Lời mời không còn tồn tại, chưa có báo cáo nào về nó, hoặc bạn không có quyền xem."
            size="sm"
            title="Lời mời không còn khả dụng"
          />
        </BoxPanel>
      );
    }
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => setConfirmed(false)}>
            Xem lại
          </Button>
        }
        description="Lần xem này có thể đã được ghi nhật ký. Xác nhận lại để thử lần nữa."
        intent="error"
        title="Không tải được lời mời"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <JobOfferReportContext offer={offer} />
      <JobOfferWithdrawActions canWithdraw={canApprove} offer={offer} />
    </div>
  );
});

export default JobOfferTargetPanel;
