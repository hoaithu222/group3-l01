import { memo } from 'react';

import { Button, Callout, Drawer, EmptyState, Skeleton } from '@/shared/ui';

import { useAdminMeeting } from '../../service/meeting.queries';
import { httpStatusOf } from '../../utils/meeting-ops.utils';
import type { ForceEndMeetingModalProps } from '../common/ForceEndMeetingModal';
import MeetingDrawerBody from './MeetingDrawerBody';

export interface MeetingOpsDrawerProps {
  /** `null` = đóng (đồng bộ với URL `?id=`). */
  meetingId: string | null;
  canForceEnd: boolean;
  onClose: () => void;
  onForceEnd: (target: NonNullable<ForceEndMeetingModalProps['meeting']>) => void;
}

/**
 * Ngăn kéo chi tiết một cuộc họp theo URL (admin.md p2-07 §2.2). Đọc `GET /admin/meetings/:id` nên mở thẳng được từ đường dẫn (F5 giữ ngăn kéo);
 * ba trạng thái tách bạch: đang tải, không tìm thấy/không được xem (404/403 — KHÔNG có "Thử lại"), lỗi tạm thời (có "Thử lại"). Nội dung do
 * `MeetingDrawerBody` vẽ.
 */
const MeetingOpsDrawer = memo(function MeetingOpsDrawer({
  meetingId,
  canForceEnd,
  onClose,
  onForceEnd,
}: MeetingOpsDrawerProps) {
  const {
    data: meeting,
    isPending,
    isError,
    error,
    refetch,
  } = useAdminMeeting(meetingId ?? undefined);
  const status = httpStatusOf(error);
  const notFound = status === 404 || status === 403;

  return (
    <Drawer
      open={meetingId !== null}
      side="right"
      size="lg"
      title={meeting?.title ?? 'Chi tiết cuộc họp'}
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && meetingId !== null ? (
        <div aria-busy="true" aria-label="Đang tải cuộc họp" role="status">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError || !meeting ? (
        notFound ? (
          <EmptyState
            description="Cuộc họp không tồn tại, đã bị xoá hoặc tài khoản của bạn không được xem."
            title="Không tìm thấy cuộc họp"
          />
        ) : (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
            description="Kiểm tra kết nối rồi thử lại."
            intent="error"
            title="Không tải được cuộc họp"
          />
        )
      ) : (
        <MeetingDrawerBody canForceEnd={canForceEnd} meeting={meeting} onForceEnd={onForceEnd} />
      )}
    </Drawer>
  );
});

export default MeetingOpsDrawer;
