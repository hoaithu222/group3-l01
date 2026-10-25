import { EmptyState } from '@/shared/ui/empty-state';
import { httpStatusOf, isNetworkError, toErrorMessage } from '@/shared/utils/errors';

interface MemberCardLoadErrorProps {
  error: unknown;
  onRetry: () => void;
}

/**
 * Lỗi tải thẻ thành viên (tấm "Thẻ thành viên" và màn quản lý khách dùng chung một truy vấn `useMemberCard`).
 *
 * Tách khỏi `MemberCardSheet` chỉ để file đó không vượt trần 200 dòng khi khối lỗi có thêm icon cảnh báo + tông `danger`
 * (file đang ở 199 dòng); `ManageGuestScreen` dùng lại vì khối lỗi giống hệt.
 *
 * Ba ca theo quy ước `ScreenState`: mất mạng → nói rõ là KẾT NỐI (`unlink`, trung tính) + "Thử lại"; 403/404 (người này đã
 * rời/bị loại, hoặc mình hết quyền xem) → ổ khoá tông `warning`, ⛔ không "Thử lại" (thử lại vẫn 404); lỗi khác → `danger` +
 * "Thử lại".
 */
export function MemberCardLoadError({ error, onRetry }: MemberCardLoadErrorProps) {
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

  if (status === 403 || status === 404) {
    return (
      <EmptyState
        description="Người này không còn trong nhóm, hoặc bạn không còn quyền xem thông tin của họ."
        icon="lock"
        title="Không xem được thẻ thành viên"
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
