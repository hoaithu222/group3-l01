import { useState } from 'react';

import { Input } from '@/shared/ui/input';
import { Dialog } from '@/shared/ui/modal';
import { showToast } from '@/shared/utils/toast.utils';

import type { MeetingDetailDto } from '../../api/meetings.types';
import { useCancelMeeting } from '../../queries/meetings.mutations';
import { classifyMeetingError } from '../../utils/meeting-errors';

const REASON_MAX = 500;

export interface MeetingCancelDialogProps {
  meeting: MeetingDetailDto;
  onClose: () => void;
  visible: boolean;
}

/**
 * Xác nhận huỷ cuộc họp. Lý do tuỳ chọn — trừ khi server báo `cancelRequiresReason` (OWNER/ADMIN huỷ hộ, có audit) thì BẮT BUỘC.
 * Gửi kèm `version` (khoá lạc quan); xung đột/lỗi ⇒ toast theo `classifyMeetingError`, dialog giữ nguyên để thử lại.
 */
export function MeetingCancelDialog({ meeting, onClose, visible }: MeetingCancelDialogProps) {
  const cancel = useCancelMeeting(meeting.id);
  const [reason, setReason] = useState('');
  const required = meeting.myActions.cancelRequiresReason;
  const trimmed = reason.trim();

  const submit = () => {
    cancel.mutate(
      { expectedVersion: meeting.version, reason: trimmed || undefined },
      {
        onError: (error) => showToast('error', classifyMeetingError(error).message),
        onSuccess: () => {
          showToast('success', 'Đã huỷ cuộc họp.');
          setReason('');
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      description="Người tham dự sẽ nhận thông báo cuộc họp bị huỷ."
      primaryAction={{
        disabled: required && trimmed.length === 0,
        label: 'Huỷ cuộc họp',
        loading: cancel.isPending,
        onPress: submit,
      }}
      secondaryAction={{ label: 'Giữ lại', onPress: onClose }}
      title="Huỷ cuộc họp?"
      variant="warning"
      visible={visible}
      onClose={onClose}
    >
      <Input
        label={required ? 'Lý do huỷ (bắt buộc)' : 'Lý do huỷ (không bắt buộc)'}
        maxLength={REASON_MAX}
        multiline
        placeholder="Ví dụ: Trùng lịch, sẽ đặt lại sau"
        value={reason}
        onChangeText={setReason}
      />
    </Dialog>
  );
}
