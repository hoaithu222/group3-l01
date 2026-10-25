import { memo } from 'react';

import { Button, Callout, EmptyState } from '@/shared/ui';

import { httpStatusOf } from '../../utils/meeting-ops.utils';

export interface MediaLoadErrorProps {
  /** Tiêu đề khối lỗi — nói rõ CÁI GÌ không tải được ("Không tải được danh sách cuộc họp"). */
  title: string;
  /** Lỗi của query: quyết định báo "không có quyền / không còn" hay "thử lại". */
  error: unknown;
  /** Tải lại — chỉ nối vào nút "Thử lại" của lỗi TẠM THỜI. */
  onRetry: () => void;
  className?: string;
}

/**
 * Trạng thái LỖI TẢI chung của các tab vận hành gọi & họp (api-patterns.md): thay cho việc để bảng trống ("Chưa có cuộc họp" là NÓI DỐI khi thật ra
 * BE đang lỗi) hoặc cụm số `0`. 403/404 → `EmptyState` không nút (thử lại vẫn thế); còn lại (mất mạng, timeout, 5xx) → `Callout` lỗi + "Thử lại".
 */
const MediaLoadError = memo(function MediaLoadError({
  title,
  error,
  onRetry,
  className,
}: MediaLoadErrorProps) {
  const status = httpStatusOf(error);

  if (status === 403 || status === 404) {
    return (
      <EmptyState
        className={className}
        description={
          status === 403
            ? 'Tài khoản của bạn không có quyền xem mục này.'
            : 'Dữ liệu này không còn tồn tại hoặc đã bị gỡ.'
        }
        icon={status === 403 ? 'lock-bold' : 'circle-exclamation-bold'}
        size="sm"
        title={title}
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
      className={className}
      description="Kiểm tra kết nối rồi thử lại."
      intent="error"
      title={title}
    />
  );
});

export default MediaLoadError;
