import { isAxiosError } from 'axios';
import { memo } from 'react';

import { Button, Callout, Drawer, EmptyState, Skeleton } from '@/shared/ui';

import { useLiveQuizSession } from '../service/live-quiz-ops.queries';
import LiveQuizSessionBody from './LiveQuizSessionBody';

export interface LiveQuizSessionDrawerProps {
  /** `null` = đóng (đồng bộ `?sessionId=`). */
  sessionId: string | null;
  onClose: () => void;
}

/**
 * Ngăn kéo chi tiết phiên Live Quiz (admin.md p5-01 §2.2). Ba trạng thái tách bạch: đang tải, không tìm thấy (404 `QUIZ_001` — id sai hoặc
 * đã bị dọn, KHÔNG có "Thử lại"), lỗi tạm thời (có "Thử lại"). Cờ `live-quiz` tắt giữa chừng cũng là 404 (`CFG_005`).
 */
const LiveQuizSessionDrawer = memo(function LiveQuizSessionDrawer({
  sessionId,
  onClose,
}: LiveQuizSessionDrawerProps) {
  const {
    data: session,
    isPending,
    isError,
    error,
    refetch,
  } = useLiveQuizSession(sessionId ?? undefined);
  const notFound =
    isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 403);

  return (
    <Drawer
      open={sessionId !== null}
      side="right"
      size="lg"
      title="Phiên Live Quiz"
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && sessionId !== null ? (
        <div aria-busy="true" aria-label="Đang tải phiên" role="status">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError || !session ? (
        notFound ? (
          <EmptyState
            description="Phiên không tồn tại, đã bị dọn hoặc tài khoản của bạn không được xem."
            title="Không tìm thấy phiên"
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
            title="Không tải được phiên"
          />
        )
      ) : (
        <LiveQuizSessionBody session={session} />
      )}
    </Drawer>
  );
});

export default LiveQuizSessionDrawer;
