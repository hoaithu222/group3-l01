import { Dialog } from '@/shared/ui/modal';

export interface ExpenseDeleteDialogProps {
  deleting: boolean;
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Hộp thoại xác nhận xoá khoản chi — xoá gỡ khoản và tính lại số dư, không hoàn tác được nên KHÔNG bao giờ xoá thẳng. */
export function ExpenseDeleteDialog({
  deleting,
  onCancel,
  onConfirm,
  visible,
}: ExpenseDeleteDialogProps) {
  return (
    <Dialog
      description="Khoản chi sẽ bị gỡ và số dư của những người tham gia được tính lại. Không hoàn tác được."
      primaryAction={{ label: 'Xoá khoản chi', loading: deleting, onPress: onConfirm }}
      secondaryAction={{ label: 'Không xoá', onPress: onCancel }}
      title="Xoá khoản chi này?"
      variant="warning"
      visible={visible}
      onClose={onCancel}
    />
  );
}
