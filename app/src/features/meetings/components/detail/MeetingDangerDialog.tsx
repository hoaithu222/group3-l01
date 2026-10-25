import { router } from 'expo-router';

import { Dialog } from '@/shared/ui/modal';
import { showToast } from '@/shared/utils/toast.utils';

import type { MeetingDetailDto } from '../../api/meetings.types';
import { useDeleteMeeting, useLeaveAttendance } from '../../queries/meetings.mutations';
import { classifyMeetingError } from '../../utils/meeting-errors';

export type DangerKind = 'delete' | 'leave';

export interface MeetingDangerDialogProps {
  /** `null` = đóng. */
  kind: DangerKind | null;
  meeting: MeetingDetailDto;
  onClose: () => void;
}

/**
 * Hộp xác nhận cho hai việc không hoàn tác của cuộc họp: RỜI (`canLeaveAttendance`, `DELETE /attendees/me`) và XOÁ (`canDelete`,
 * `DELETE /meetings/:id?expectedVersion=`). Việc bấm nằm ở menu "⋯" của AppBar (`MeetingDetailMenu`); ở đây chỉ hỏi lại và chạy. Xong thì
 * cuộc họp biến khỏi cache (`forgetMeeting`) ⇒ quay lại màn trước.
 */
export function MeetingDangerDialog({ kind, meeting, onClose }: MeetingDangerDialogProps) {
  const remove = useDeleteMeeting(meeting.id);
  const leave = useLeaveAttendance(meeting.id);

  const done = (message: string) => {
    showToast('success', message);
    onClose();
    router.back();
  };
  const onError = (error: unknown) => showToast('error', classifyMeetingError(error).message);

  const confirm = () => {
    if (kind === 'delete') {
      remove.mutate(
        { expectedVersion: meeting.version },
        { onError, onSuccess: () => done('Đã xoá cuộc họp.') },
      );
    } else if (kind === 'leave') {
      leave.mutate(undefined, { onError, onSuccess: () => done('Bạn đã rời cuộc họp.') });
    }
  };

  const isDelete = kind === 'delete';
  return (
    <Dialog
      description={
        isDelete
          ? 'Cuộc họp sẽ bị xoá khỏi lịch của mọi người tham dự. Không thể hoàn tác.'
          : 'Cuộc họp sẽ biến khỏi lịch của bạn. Người chủ trì có thể mời lại bạn.'
      }
      primaryAction={{
        label: isDelete ? 'Xoá' : 'Rời',
        loading: remove.isPending || leave.isPending,
        onPress: confirm,
      }}
      secondaryAction={{ label: 'Giữ lại', onPress: onClose }}
      title={isDelete ? 'Xoá cuộc họp?' : 'Rời cuộc họp?'}
      variant="warning"
      visible={kind !== null}
      onClose={onClose}
    />
  );
}
