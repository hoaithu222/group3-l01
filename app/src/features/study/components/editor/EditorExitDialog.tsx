import { Dialog } from '@/shared/ui/modal';

export interface EditorExitDialogProps {
  visible: boolean;
  onClose: () => void;
  /** "Bỏ thay đổi": xoá nháp và rời màn. */
  onDiscard: () => void;
}

/** Rời trình soạn khi còn thay đổi chưa lưu (app.md p4-01 §5): hỏi "Bỏ thay đổi?" — nháp chỉ nằm trong bộ nhớ, bỏ là mất thật. */
export function EditorExitDialog({ onClose, onDiscard, visible }: EditorExitDialogProps) {
  return (
    <Dialog
      description="Các thay đổi chưa lưu sẽ bị mất."
      primaryAction={{ label: 'Bỏ thay đổi', onPress: onDiscard }}
      secondaryAction={{ label: 'Tiếp tục sửa', onPress: onClose }}
      title="Bỏ thay đổi?"
      variant="warning"
      visible={visible}
      onClose={onClose}
    />
  );
}
