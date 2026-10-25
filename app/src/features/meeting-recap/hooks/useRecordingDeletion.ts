import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import type { RecordingDto } from '../api/meeting-recap.types';
import { useDeleteRecording } from '../queries/recording.queries';
import { errorCodeOf, recapErrorMessage } from '../utils/recap-errors';

/**
 * Luồng xoá bản ghi (app.md §3, README RR-20): hỏi xác nhận → `DELETE /recordings/:id`. Chủ trì theo lịch xoá không cần lý do; OWNER
 * workspace không chủ trì → BE trả 400 `VAL_001` "Lý do bắt buộc" ⇒ hộp thoại chuyển sang hỏi lý do (≥ 10 ký tự) rồi gửi lại. Đang ghi
 * (`MEET_009`) / đã xoá (`REC_005`) → đóng hộp thoại + báo, không thử lại.
 */
export function useRecordingDeletion(meetingId: string, onDeleted?: (recordingId: string) => void) {
  const mutation = useDeleteRecording(meetingId);
  const [target, setTarget] = useState<RecordingDto | null>(null);
  const [needReason, setNeedReason] = useState(false);
  const [reason, setReason] = useState('');

  const close = () => {
    setTarget(null);
    setNeedReason(false);
    setReason('');
  };

  const confirm = async () => {
    if (!target) return;
    try {
      await mutation.mutateAsync({ reason: needReason ? reason.trim() : undefined, recordingId: target.id });
      showToast('success', 'Đã xoá bản ghi.');
      const id = target.id;
      close();
      onDeleted?.(id);
    } catch (error) {
      const code = errorCodeOf(error);
      if (code === 'VAL_001' && !needReason) {
        setNeedReason(true);
        return;
      }
      if (code === 'MEET_009' || code === 'REC_005') close();
      showToast('error', code === 'MEET_009' ? 'Bản ghi đang được ghi — dừng ghi trước khi xoá.' : recapErrorMessage(error));
    }
  };

  return {
    ask: (recording: RecordingDto) => setTarget(recording),
    close,
    confirm,
    deleting: mutation.isPending,
    needReason,
    reason,
    setReason,
    target,
  };
}
