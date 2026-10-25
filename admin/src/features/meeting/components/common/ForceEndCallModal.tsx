import type { AxiosError } from 'axios';
import { memo, useCallback } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { ConfirmWithReasonModal } from '@/shared/ui';

import {
  CALL_BELONGS_TO_MEETING_CODE,
  CALL_FORCE_END_FINAL_CODES,
  CALL_FORCE_END_IMPACT,
} from '../../constants/call.constants';
import { useForceEndCall } from '../../service/meeting.queries';
import type { AdminCallRow } from '../../types/call.types';
import { errorDetail } from '../../utils/meeting-ops.utils';

export interface ForceEndCallModalProps {
  /** Cuộc gọi định kết thúc; `null` = đóng. */
  call: Pick<AdminCallRow, 'id' | 'label' | 'peakParticipants'> | null;
  /** `ADMIN_MEDIA_002`: cuộc gọi thuộc một cuộc họp — nơi gọi hiện khung "Mở cuộc họp" với id này. */
  onBelongsToMeeting: (meetingId: string) => void;
  onClose: () => void;
}

/**
 * Hộp thoại "Kết thúc cuộc gọi" (admin.md p2-07 §2.3): lý do ≥ 10 ký tự + tác động ("cuộc gọi kết thúc cho mọi người tham gia"), rồi
 * `POST …/force-end` (202, audit `call.force-end`). Lỗi mà thử lại cũng vẫn thế đều ĐÓNG hộp thoại: `CALL_005` (đã kết thúc — hook đã toast) và
 * `ADMIN_MEDIA_002` (kèm `details.meetingId` → `onBelongsToMeeting`); lỗi khác ném ra để hộp thoại giữ mở.
 */
const ForceEndCallModal = memo(function ForceEndCallModal({
  call,
  onBelongsToMeeting,
  onClose,
}: ForceEndCallModalProps) {
  const forceEnd = useForceEndCall();

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!call) return;
      try {
        await forceEnd.mutateAsync({ id: call.id, reason });
        onClose();
      } catch (err) {
        const code = extractErrorCode(err as AxiosError);
        if (!CALL_FORCE_END_FINAL_CODES.includes(code)) throw err;
        const meetingId =
          code === CALL_BELONGS_TO_MEETING_CODE ? errorDetail(err, 'meetingId') : undefined;
        if (meetingId) onBelongsToMeeting(meetingId);
        onClose();
      }
    },
    [call, forceEnd, onBelongsToMeeting, onClose],
  );

  return (
    <ConfirmWithReasonModal
      confirmLabel="Kết thúc cuộc gọi"
      confirmTone="danger"
      impact={
        <>
          <span className="text-fg-1">{`${call?.label ?? ''}. `}</span>
          {CALL_FORCE_END_IMPACT}
        </>
      }
      open={call !== null}
      title="Kết thúc cuộc gọi"
      onConfirm={handleConfirm}
      onOpenChange={(open) => !open && onClose()}
    />
  );
});

export default ForceEndCallModal;
