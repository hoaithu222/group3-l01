import type { AxiosError } from 'axios';
import { memo, useCallback } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { ConfirmWithReasonModal } from '@/shared/ui';

import {
  MEETING_FORCE_END_FINAL_CODES,
  MEETING_FORCE_END_IMPACT,
} from '../../constants/meeting.constants';
import { useForceEndMeeting } from '../../service/meeting.queries';
import type { AdminMeetingRow } from '../../types/meeting.types';
import { formatCount } from '../../utils/meeting-ops.utils';

export interface ForceEndMeetingModalProps {
  /** Cuộc họp định kết thúc; `null` = đóng. `connectedCount` chỉ có khi mở từ ngăn kéo (đọc từ `currentSession`). */
  meeting: (Pick<AdminMeetingRow, 'id' | 'title'> & { connectedCount?: number }) | null;
  onClose: () => void;
}

/**
 * Hộp thoại "Kết thúc cuộc họp" (admin.md p2-07 §2.2): lý do ≥ 10 ký tự (khớp `reasonSchema` BE) + nêu tác động (tiêu đề, số người đang trong phòng,
 * đuổi mọi người, có ghi nhật ký), rồi `POST …/force-end` (202, audit `meeting.force-end`). `MEET_009` (không còn LIVE) → toast "Cuộc họp không còn
 * diễn ra" (hook lo) và đóng hộp thoại; lỗi khác ném ra để hộp thoại giữ mở cho người dùng thử lại.
 */
const ForceEndMeetingModal = memo(function ForceEndMeetingModal({
  meeting,
  onClose,
}: ForceEndMeetingModalProps) {
  const forceEnd = useForceEndMeeting();

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!meeting) return;
      try {
        await forceEnd.mutateAsync({ id: meeting.id, reason });
        onClose();
      } catch (err) {
        if (MEETING_FORCE_END_FINAL_CODES.includes(extractErrorCode(err as AxiosError))) {
          onClose();
          return;
        }
        throw err;
      }
    },
    [meeting, forceEnd, onClose],
  );

  const people =
    meeting?.connectedCount === undefined
      ? ''
      : ` · ${formatCount(meeting.connectedCount)} người đang trong phòng`;

  return (
    <ConfirmWithReasonModal
      confirmLabel="Kết thúc cuộc họp"
      confirmTone="danger"
      impact={
        <>
          <span className="text-fg-1">{`${meeting?.title ?? ''}${people}. `}</span>
          {MEETING_FORCE_END_IMPACT}
        </>
      }
      open={meeting !== null}
      title="Kết thúc cuộc họp"
      onConfirm={handleConfirm}
      onOpenChange={(open) => !open && onClose()}
    />
  );
});

export default ForceEndMeetingModal;
