import { isAxiosError } from 'axios';
import { memo } from 'react';

import { Button, Callout, EmptyState } from '@/shared/ui';

export interface ListLoadErrorProps {
  /** "Không tải được danh sách địa điểm". */
  title: string;
  /** Lỗi của truy vấn — 403 (thiếu quyền) được nói rõ thay vì mời "Thử lại" (thử lại vẫn 403). */
  error?: unknown;
  onRetry: () => void;
}

/**
 * Trạng thái LỖI TẢI của danh sách/chi tiết (`api-patterns.md` §Trạng thái LỖI TẢI): không được vẽ bảng rỗng như thể dữ liệu
 * thật sự trống. Lỗi tạm thời (mạng, 5xx) → `Callout` + nút "Thử lại" (đi qua prop `action`); **403** → `EmptyState` nói rõ lý do,
 * KHÔNG có nút "Thử lại" (vd quản trị viên mở nhầm `/partner`: BE không cấp `partner:*` cho vai hệ thống).
 */
const ListLoadError = memo(function ListLoadError({ title, error, onRetry }: ListLoadErrorProps) {
  if (isAxiosError(error) && error.response?.status === 403) {
    return (
      <EmptyState
        description="Tài khoản của bạn không có quyền xem dữ liệu này."
        title="Không có quyền xem dữ liệu này"
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

export default ListLoadError;
