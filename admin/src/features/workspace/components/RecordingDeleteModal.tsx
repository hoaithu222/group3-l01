import type { AxiosError } from 'axios';
import { memo, useCallback } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { ConfirmWithReasonModal } from '@/shared/ui';

import { RECORDING_DELETE_FINAL_CODES } from '../constants/workspace-recordings.constants';
import { useDeleteAdminRecording } from '../service/workspace-recordings.queries';
import type { AdminRecordingRow } from '../types/workspace-recordings.types';

export interface RecordingDeleteModalProps {
  /** Bản ghi đang định xoá; `null` = đóng. */
  row: AdminRecordingRow | null;
  onClose: () => void;
}

/**
 * Hộp thoại "Xoá bản ghi" (admin.md p2-06 §2.4): lý do ≥ 10 ký tự (khớp `reasonSchema` BE) + nêu tác động, rồi `DELETE /admin/recordings/:id?reason=`
 * (audit `recording.delete`). Lỗi mà thử lại cũng vẫn thế (`REC_005` đã xoá / `MEET_009` còn đang ghi) → đóng hộp thoại (toast đã hiện); lỗi khác
 * ném ra để hộp thoại giữ mở cho người dùng thử lại.
 */
const RecordingDeleteModal = memo(function RecordingDeleteModal({
  row,
  onClose,
}: RecordingDeleteModalProps) {
  const remove = useDeleteAdminRecording();

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!row) return;
      try {
        await remove.mutateAsync({ recordingId: row.id, reason });
        onClose();
      } catch (err) {
        if (RECORDING_DELETE_FINAL_CODES.includes(extractErrorCode(err as AxiosError))) {
          onClose();
          return;
        }
        throw err;
      }
    },
    [row, remove, onClose],
  );

  return (
    <ConfirmWithReasonModal
      confirmLabel="Xoá bản ghi"
      confirmTone="danger"
      impact="Bản ghi bị xoá vĩnh viễn khỏi lưu trữ, người tham dự không xem được nữa. Không hoàn tác."
      open={row !== null}
      title={`Xoá bản ghi${row?.meeting.title ? ` "${row.meeting.title}"` : ''}`}
      onConfirm={handleConfirm}
      onOpenChange={(open) => !open && onClose()}
    />
  );
});

export default RecordingDeleteModal;
