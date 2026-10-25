import { memo } from 'react';

import { Drawer, EmptyState, Skeleton } from '@/shared/ui';

import { useAdminRecordingDetail } from '../service/workspace-recordings.queries';
import type { AdminRecordingRow } from '../types/workspace-recordings.types';
import RecordingDetailBody from './RecordingDetailBody';

export interface RecordingDetailDrawerProps {
  /** `null` = đóng (đồng bộ với URL `?recId=`). */
  recordingId: string | null;
  /** Có `meeting:delete` (chỉ `admin`) — thiếu thì KHÔNG có nút Xoá. */
  canDelete: boolean;
  onClose: () => void;
  onDelete: (row: AdminRecordingRow) => void;
}

/**
 * Ngăn kéo chi tiết một bản ghi hình theo URL (admin.md p2-06 §2.3). Đọc `GET /admin/recordings/:id` nên mở thẳng được từ đường dẫn;
 * id không tồn tại → khung "không tìm thấy" (không toast). Nội dung do `RecordingDetailBody` vẽ.
 */
const RecordingDetailDrawer = memo(function RecordingDetailDrawer({
  recordingId,
  canDelete,
  onClose,
  onDelete,
}: RecordingDetailDrawerProps) {
  const { data: rec, isPending, isError } = useAdminRecordingDetail(recordingId ?? undefined);

  return (
    <Drawer
      open={recordingId !== null}
      side="right"
      size="lg"
      title={rec?.meeting.title ?? 'Bản ghi hình'}
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && recordingId !== null ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !rec ? (
        <EmptyState
          description="Bản ghi không tồn tại hoặc bạn không còn quyền xem."
          title="Không tìm thấy bản ghi"
        />
      ) : (
        <RecordingDetailBody canDelete={canDelete} rec={rec} onDelete={onDelete} />
      )}
    </Drawer>
  );
});

export default RecordingDetailDrawer;
