import { memo } from 'react';

import { Button, Callout, EmptyState } from '@/shared/ui';

import { errorStatusOf } from '../utils/economy-errors';

export interface EconomyLoadErrorProps {
  /** Lỗi của truy vấn (`useQuery().error`). */
  error: unknown;
  /** "Không tải được …" — tên thứ đang tải. */
  title: string;
  /** Câu cho 404 (mặc định: bản ghi không còn). */
  notFoundDescription?: string;
  onRetry: () => void;
}

/**
 * Trạng thái LỖI TẢI (`api-patterns.md`): lỗi tạm thời (mất mạng, 5xx) → `Callout` + "Thử lại"; 403/404 → `EmptyState` nói rõ lý do,
 * KHÔNG có nút thử lại (gọi lại vẫn 403/404). Không bao giờ vẽ bảng rỗng như thể chưa có dữ liệu.
 */
const EconomyLoadError = memo(function EconomyLoadError({
  error,
  title,
  notFoundDescription = 'Không tìm thấy dữ liệu — có thể bản ghi đã bị xoá.',
  onRetry,
}: EconomyLoadErrorProps) {
  const status = errorStatusOf(error);
  if (status === 403 || status === 404) {
    return (
      <EmptyState
        description={
          status === 403 ? 'Tài khoản của bạn chưa có quyền xem dữ liệu này.' : notFoundDescription
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

export default EconomyLoadError;
