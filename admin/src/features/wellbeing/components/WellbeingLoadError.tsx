import { memo } from 'react';

import { Button, Callout, EmptyState } from '@/shared/ui';

import { errorStatusOf } from '../utils/wellbeing-errors';

export interface WellbeingLoadErrorProps {
  /** Lỗi của truy vấn (`useQuery().error`). */
  error: unknown;
  /** "Không tải được …" — tên thứ đang tải. */
  title: string;
  onRetry: () => void;
}

/**
 * Trạng thái LỖI TẢI (`api-patterns.md`): lỗi tạm thời (mất mạng, 5xx) → `Callout` + "Thử lại"; 403/404 → `EmptyState` nói rõ lý do, KHÔNG có nút thử lại
 * (gọi lại vẫn 403/404: thiếu quyền, hoặc BE đang tắt phân hệ). Không bao giờ vẽ số `0` như thể chưa có dữ liệu.
 */
const WellbeingLoadError = memo(function WellbeingLoadError({
  error,
  title,
  onRetry,
}: WellbeingLoadErrorProps) {
  const status = errorStatusOf(error);
  if (status === 403 || status === 404) {
    return (
      <EmptyState
        description={
          status === 403
            ? 'Tài khoản của bạn chưa có quyền xem dữ liệu này.'
            : 'Tính năng theo dõi sức khoẻ học tập đang tắt hoặc chưa có trên máy chủ.'
        }
        icon="triangle-exclamation-bold"
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
      description="Kiểm tra kết nối rồi thử lại."
      intent="error"
      title={title}
    />
  );
});

export default WellbeingLoadError;
