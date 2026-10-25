import { EmptyState } from '@/shared/ui/empty-state';
import { httpStatusOf, isNetworkError, toErrorMessage } from '@/shared/utils/errors';

interface ChannelLoadErrorProps {
  /** Lỗi của truy vấn chi tiết kênh; `undefined`/`null` (không kèm lỗi) = không tìm thấy kênh. */
  error: unknown;
  onRetry: () => void;
}

/**
 * Khối "không tải được kênh" của màn Thông tin kênh — ba ca theo quy ước `ScreenState`:
 *  · MẤT MẠNG → nói rõ là lỗi KẾT NỐI (`unlink`, trung tính) + "Thử lại": có sóng là chữa được.
 *  · 403/404 hoặc không có kênh (mất quyền, kênh đã xoá, không còn trong kênh riêng) → ổ khoá tông `warning`, ⛔ KHÔNG "Thử lại"
 *    (thử lại vẫn 404) — cùng luật với `ChannelChatScreen` ("không lỗi mà không có kênh ⇒ không Thử lại").
 *  · lỗi khác → cảnh báo tông `danger` + "Thử lại".
 */
export function ChannelLoadError({ error, onRetry }: ChannelLoadErrorProps) {
  const retry = [{ label: 'Thử lại', onPress: onRetry }];
  const status = httpStatusOf(error);

  if (isNetworkError(error)) {
    return (
      <EmptyState
        actions={retry}
        description={toErrorMessage(error)}
        icon="unlink"
        title="Mất kết nối"
        tone="neutral"
      />
    );
  }

  if (!error || status === 403 || status === 404) {
    return (
      <EmptyState
        description="Kênh không tồn tại, đã bị xoá, hoặc bạn không còn quyền xem kênh này."
        icon="lock"
        title="Không mở được kênh"
        tone="warning"
      />
    );
  }

  return (
    <EmptyState
      actions={retry}
      description={toErrorMessage(error)}
      icon="alert-warning"
      title="Không tải được"
      tone="danger"
    />
  );
}
