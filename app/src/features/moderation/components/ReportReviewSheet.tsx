import { toErrorMessage } from '@/core/api/client.helpers';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';

import type { QueueScope, ScopeReportItem } from '../api/moderation.types';
import { RESOLVE_ACTION_COPY } from '../constants/moderation.constants';
import { useResolveFlow } from '../hooks/useResolveFlow';
import { useRetainedRequest } from '../hooks/useRetainedRequest';
import { useReport } from '../queries/reports.queries';
import { ReportDetailBody } from './ReportDetailBody';
import { ResolveReportForm } from './ResolveReportForm';

export interface ReportReviewSheetProps {
  /** `null` = đóng. */
  item: ScopeReportItem | null;
  onClose: () => void;
  scope: QueueScope;
}

/**
 * Tấm xem + xử lý MỘT nhóm báo cáo (p1-08 #9) — HAI bước trong CÙNG một `BottomSheet` (chi tiết → lý do),
 * không phải hai `<Modal>` chồng nhau: hai modal liên tiếp là chỗ iOS hay nuốt mất tấm thứ hai.
 */
export function ReportReviewSheet({ item, onClose, scope }: ReportReviewSheetProps) {
  const { retained, session } = useRetainedRequest(item);
  if (!retained) return null;
  return (
    <ReviewBody
      key={session}
      item={retained}
      scope={scope}
      visible={item !== null}
      onClose={onClose}
    />
  );
}

interface ReviewBodyProps {
  item: ScopeReportItem;
  onClose: () => void;
  scope: QueueScope;
  visible: boolean;
}

function ReviewBody({ item, onClose, scope, visible }: ReviewBodyProps) {
  const detail = useReport(item.reportId);
  const flow = useResolveFlow(item.reportId, scope, onClose);
  const copy = flow.action ? RESOLVE_ACTION_COPY[flow.action] : null;

  return (
    <BottomSheet
      dismissOnBackdrop={!flow.isPending}
      footer={
        flow.action && copy ? (
          // `SheetActions` chia đôi đúng cách — ⛔ hai `Button fullWidth` trần trong `flex-row` đẩy nút xác nhận ra ngoài mép tấm.
          <SheetActions
            primary={{
              disabled: !flow.canConfirm,
              label: copy.confirm,
              loading: flow.isPending,
              onPress: flow.confirm,
            }}
            secondary={{ disabled: flow.isPending, label: 'Quay lại', onPress: flow.back }}
            tone={copy.danger ? 'danger' : 'primary'}
          />
        ) : undefined
      }
      scrollable
      title={copy ? copy.title : 'Báo cáo cần xử lý'}
      visible={visible}
      onClose={onClose}
    >
      {flow.action ? (
        <ResolveReportForm
          action={flow.action}
          disabled={flow.isPending}
          errorMessage={flow.errorMessage}
          reason={flow.reason}
          reasonError={flow.reasonError}
          onChangeReason={flow.setReason}
        />
      ) : (
        <ReportDetailBody
          detail={detail.data}
          detailError={detail.isError ? toErrorMessage(detail.error) : undefined}
          detailLoading={detail.isLoading}
          item={item}
          onChoose={flow.choose}
        />
      )}
    </BottomSheet>
  );
}
