import { Dialog } from '@/shared/ui/modal';

import { describeItem } from '../utils/describe-item';
import type { ExplorerItem } from '../utils/explorer-items';

export interface ConfirmDeleteDialogProps {
  item: ExplorerItem | null;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  /** `LIMITS.resource.trashRetentionDays` (30). */
  retentionDays: number;
}

/**
 * Xác nhận xoá: nói rõ "chuyển vào thùng rác, giữ N ngày" (app.md p3-01 §7) —
 * người dùng cần biết đây KHÔNG phải xoá hẳn và còn khôi phục được.
 */
export function ConfirmDeleteDialog({
  item,
  onClose,
  onConfirm,
  pending,
  retentionDays,
}: ConfirmDeleteDialogProps) {
  const view = item ? describeItem(item) : null;
  const isFolder = item?.kind === 'folder';

  return (
    <Dialog
      description={`"${view?.title ?? ''}"${isFolder ? ' cùng nội dung bên trong' : ''} sẽ chuyển vào thùng rác, giữ ${retentionDays} ngày rồi xoá hẳn. Bạn có thể khôi phục trong thời gian đó.`}
      primaryAction={{ label: 'Chuyển vào thùng rác', loading: pending, onPress: onConfirm }}
      secondaryAction={{ disabled: pending, label: 'Huỷ', onPress: onClose }}
      title={isFolder ? 'Xoá thư mục?' : 'Xoá tệp?'}
      variant="warning"
      visible={item !== null}
      onClose={onClose}
    />
  );
}
