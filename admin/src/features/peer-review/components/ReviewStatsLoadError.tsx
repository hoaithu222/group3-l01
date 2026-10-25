import { isAxiosError } from 'axios';
import { memo } from 'react';

import { Button, Callout, EmptyState } from '@/shared/ui';

export interface ReviewStatsLoadErrorProps {
  /** Lỗi của query: quyết định báo "không có quyền / không còn" hay "thử lại". */
  error: unknown;
  /** Tải lại — chỉ nối vào nút "Thử lại" của lỗi TẠM THỜI. */
  onRetry: () => void;
}

const TITLE = 'Không tải được số liệu chấm chéo';

/**
 * Trạng thái lỗi tải của khối "Chấm chéo" — thay cho cụm số `0` (nói dối khi BE đang lỗi):
 *  - 403 / 404 → `EmptyState`, KHÔNG có nút "Thử lại": thiếu quyền hoặc nhóm không còn thì tải lại vẫn thế.
 *  - còn lại (mất mạng, timeout, 5xx) → `Callout` lỗi + nút "Thử lại" (`Callout.action`).
 */
const ReviewStatsLoadError = memo(function ReviewStatsLoadError({
  error,
  onRetry,
}: ReviewStatsLoadErrorProps) {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 403 || status === 404) {
    return (
      <EmptyState
        description={
          status === 403
            ? 'Tài khoản của bạn không có quyền xem mục này.'
            : 'Dữ liệu này không còn tồn tại hoặc đã bị gỡ.'
        }
        icon={status === 403 ? 'lock-bold' : 'circle-exclamation-bold'}
        size="sm"
        title={TITLE}
      />
    );
  }

  return (
    <Callout
      action={
        <Button size="sm" variant="stroke" onClick={onRetry}>
          Thử lại
        </Button>
      }
      description="Kiểm tra kết nối rồi thử lại."
      intent="error"
      title={TITLE}
    />
  );
});

export default ReviewStatsLoadError;
