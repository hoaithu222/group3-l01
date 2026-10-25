import { memo } from 'react';

import { Button, Callout } from '@/shared/ui';
import { formatDate, parseDate } from '@/shared/utils/format';

export interface PendingDeletionCalloutProps {
  /** Mốc tự ẩn danh hoá nếu không huỷ kịp (`AdminUser.deletionGraceUntil`); thiếu ⇒ chỉ báo "đang chờ xoá". */
  deletionGraceUntil?: string | null;
  /** Có quyền huỷ yêu cầu xoá (`user:delete`, không phải chính mình) — không có thì không hiện nút. */
  canCancel: boolean;
  onCancel: () => void;
}

/** Banner "Đang chờ xoá tài khoản" ở đầu drawer người dùng (`status === 'PENDING_DELETION'`). */
const PendingDeletionCallout = memo(function PendingDeletionCallout({
  deletionGraceUntil,
  canCancel,
  onCancel,
}: PendingDeletionCalloutProps) {
  // `ceil` chứ không `floor`: còn 20 giờ phải đọc là "còn khoảng 1 ngày", không phải "còn khoảng 0 ngày".
  const daysLeft = deletionGraceUntil
    ? Math.max(0, Math.ceil(parseDate(deletionGraceUntil).diff(parseDate(new Date()), 'day', true)))
    : null;

  return (
    <Callout
      action={
        canCancel ? (
          <Button size="sm" variant="stroke" onClick={onCancel}>
            Huỷ yêu cầu xoá
          </Button>
        ) : undefined
      }
      description={
        deletionGraceUntil
          ? `Tự động ẩn danh hoá lúc ${formatDate(deletionGraceUntil, 'HH:mm DD/MM/YYYY')} nếu không huỷ (${daysLeft === 0 ? 'sắp hết ân hạn' : `còn khoảng ${daysLeft} ngày`}).`
          : 'Tài khoản đang chờ xoá.'
      }
      intent="warning"
      title="Đang chờ xoá tài khoản"
    />
  );
});

export default PendingDeletionCallout;
