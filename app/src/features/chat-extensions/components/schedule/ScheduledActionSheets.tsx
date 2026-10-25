import type { ScheduledMessageView } from '../../api/chat-extensions.types';
import type { useScheduledActions } from '../../hooks/useScheduledActions';
import { useChatExtLimits } from '../../hooks/useChatSubFeatures';
import { describeChatExtError } from '../../utils/error-info';
import { daysToMs } from '../../utils/local-time';
import { Dialog } from '@/shared/ui/modal';
import { WhenPickerSheet } from '../when/WhenPickerSheet';
import { EditScheduledContentSheet } from './EditScheduledContentSheet';
import type { ScheduledActionKind } from './ScheduledMessageRow';

export interface ScheduledActionTarget {
  kind: Exclude<ScheduledActionKind, 'sendNow'>;
  row: ScheduledMessageView;
  /** Tăng mỗi lần mở — `key` để tấm dựng lại với trạng thái sạch. */
  nonce: number;
}

export interface ScheduledActionSheetsProps {
  target: ScheduledActionTarget | null;
  visible: boolean;
  actions: ReturnType<typeof useScheduledActions>;
  onClose: () => void;
}

/**
 * Các tấm/hộp thoại của thao tác trên MỘT dòng "Tin đã hẹn": Sửa giờ · Gửi lại (cùng tấm chọn thời gian) · Sửa nội dung · Huỷ (hộp thoại xác nhận). `target` được GIỮ sau khi đóng để tấm còn nội dung
 * trong lúc trượt xuống; `visible` mới quyết định hiện. "Gửi ngay" không có tấm (chạy thẳng ở màn). Lỗi thuộc ô giờ (`SCHED_001`) hiện dưới ô, mã khác trong khối cảnh báo — không toast lặp
 * (`useScheduledFailure` bỏ qua lỗi thuộc ô giờ).
 */
export function ScheduledActionSheets({ target, visible, actions, onClose }: ScheduledActionSheetsProps) {
  const limits = useChatExtLimits().scheduled;
  const window = { minLeadMs: limits.minLeadSeconds * 1000, maxMs: daysToMs(limits.sendAtMaxDays) };
  const key = `${target?.kind ?? 'none'}-${target?.nonce ?? 0}`;
  const row = target?.row;

  const timeSheet = (kind: 'reschedule' | 'resend') => {
    const mutation = actions[kind];
    const error = mutation.isError ? describeChatExtError(mutation.error) : undefined;
    return (
      <WhenPickerSheet
        key={`${kind}-${key}`}
        kind="schedule"
        otherError={error && !error.timeField ? error.message : undefined}
        pending={mutation.isPending}
        subject="Thời điểm gửi"
        submitLabel={kind === 'reschedule' ? 'Lưu giờ gửi' : 'Hẹn gửi lại'}
        summaryPrefix="Gửi lúc"
        timeError={error?.timeField ? error.message : undefined}
        title={kind === 'reschedule' ? 'Sửa giờ gửi' : 'Gửi lại tin này'}
        visible={visible && target?.kind === kind}
        window={window}
        onClose={onClose}
        onSubmit={(at) => {
          if (row) mutation.mutate({ row, sendAt: at.toISOString() }, { onSuccess: onClose });
        }}
      />
    );
  };

  return (
    <>
      {timeSheet('reschedule')}
      {timeSheet('resend')}
      <EditScheduledContentSheet
        key={`edit-${key}`}
        error={actions.editContent.isError ? actions.editContent.error : undefined}
        pending={actions.editContent.isPending}
        row={target?.kind === 'edit' ? target.row : null}
        visible={visible && target?.kind === 'edit'}
        onClose={onClose}
        onSave={(content) => {
          if (row) actions.editContent.mutate({ row, content }, { onSuccess: onClose });
        }}
      />
      <Dialog
        description="Tin sẽ không được gửi nữa. Không thể hoàn tác."
        primaryAction={{
          label: 'Huỷ tin',
          onPress: () => {
            onClose();
            if (row) actions.cancel.mutate(row);
          },
        }}
        secondaryAction={{ label: 'Giữ lại', onPress: onClose }}
        title="Huỷ tin hẹn giờ này?"
        variant="warning"
        visible={visible && target?.kind === 'cancel'}
        onClose={onClose}
      />
    </>
  );
}
