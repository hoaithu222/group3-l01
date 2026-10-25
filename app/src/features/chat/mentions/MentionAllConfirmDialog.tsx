import { Dialog } from '@/shared/ui/modal';

export interface MentionAllConfirmDialogProps {
  /** Số người sẽ nhận (`allCount` của BE) — `undefined` = không mở hộp thoại. */
  count: number | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Xác nhận trước khi chèn `@Tất cả` cho nhóm đông (app.md p1-06 §3 "`@all` xác nhận: nếu `allCount > 20`").
 * `@all` báo cho MỌI thành viên và BE giới hạn 5 lần/giờ/người/nhóm (`MSG_021`) — một cú chạm nhầm vào dòng đầu
 * danh sách gợi ý vừa đốt một lượt vừa làm phiền cả nhóm, nên hỏi lại khi số người đủ lớn.
 */
export function MentionAllConfirmDialog({
  count,
  onConfirm,
  onCancel,
}: MentionAllConfirmDialogProps) {
  return (
    <Dialog
      description={`Nhắc tên sẽ báo cho ${count ?? 0} người. Tiếp tục?`}
      primaryAction={{ label: 'Tiếp tục', onPress: onConfirm }}
      secondaryAction={{ label: 'Huỷ', onPress: onCancel }}
      title="Nhắc tất cả thành viên?"
      variant="warning"
      visible={count !== undefined}
      onClose={onCancel}
    />
  );
}
