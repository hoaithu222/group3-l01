import { memo } from 'react';

import { Button, Callout, Drawer, EmptyState, Skeleton } from '@/shared/ui';

import { useAdminCall } from '../../service/meeting.queries';
import type { AdminCallRow } from '../../types/call.types';
import { httpStatusOf } from '../../utils/meeting-ops.utils';
import CallDrawerBody from './CallDrawerBody';

export interface CallOpsDrawerProps {
  /** `null` = đóng (đồng bộ với URL `?id=`). */
  callId: string | null;
  canForceEnd: boolean;
  onClose: () => void;
  onForceEnd: (target: Pick<AdminCallRow, 'id' | 'label' | 'peakParticipants'>) => void;
}

/**
 * Ngăn kéo chi tiết một cuộc gọi theo URL (admin.md p2-07 §2.3). Đọc `GET /admin/calls/:id` nên mở thẳng được từ đường dẫn (F5 giữ ngăn kéo); ba trạng
 * thái tách bạch: đang tải, không tìm thấy/không được xem (404/403 — KHÔNG có "Thử lại"), lỗi tạm thời (có "Thử lại"). Nội dung do `CallDrawerBody` vẽ.
 */
const CallOpsDrawer = memo(function CallOpsDrawer({
  callId,
  canForceEnd,
  onClose,
  onForceEnd,
}: CallOpsDrawerProps) {
  const { data: call, isPending, isError, error, refetch } = useAdminCall(callId ?? undefined);
  const status = httpStatusOf(error);
  const notFound = status === 404 || status === 403;

  return (
    <Drawer
      open={callId !== null}
      side="right"
      size="lg"
      title={call?.label ?? 'Chi tiết cuộc gọi'}
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && callId !== null ? (
        <div aria-busy="true" aria-label="Đang tải cuộc gọi" role="status">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError || !call ? (
        notFound ? (
          <EmptyState
            description="Cuộc gọi không tồn tại hoặc tài khoản của bạn không được xem."
            title="Không tìm thấy cuộc gọi"
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
            title="Không tải được cuộc gọi"
          />
        )
      ) : (
        <CallDrawerBody call={call} canForceEnd={canForceEnd} onForceEnd={onForceEnd} />
      )}
    </Drawer>
  );
});

export default CallOpsDrawer;
