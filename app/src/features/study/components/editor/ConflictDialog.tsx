import { Dialog } from '@/shared/ui/modal';

export interface ConflictDialogProps {
  busy: boolean;
  visible: boolean;
  onClose: () => void;
  /** "Giữ nháp và lưu đè": lấy version mới rồi gửi lại thay đổi của mình. */
  onKeep: () => void;
  /** "Tải bản mới": bỏ nháp, dùng bản của server. */
  onReload: () => void;
}

/**
 * `409 RES_003` khi lưu (ST-25): bộ đã được sửa ở nơi khác. Nháp KHÔNG bị xoá — người dùng chọn (app.md p4-01 §3):
 * dùng bản mới (mất nháp) hoặc giữ nháp và lưu đè bằng version mới.
 */
export function ConflictDialog({ busy, onClose, onKeep, onReload, visible }: ConflictDialogProps) {
  return (
    <Dialog
      description="Bộ học vừa được sửa ở một nơi khác. Bạn có thể tải bản mới (mất thay đổi chưa lưu) hoặc giữ thay đổi của mình và lưu đè lên bản mới."
      primaryAction={{ label: 'Giữ nháp và lưu đè', loading: busy, onPress: onKeep }}
      secondaryAction={{ disabled: busy, label: 'Tải bản mới', onPress: onReload }}
      title="Bộ học đã được sửa ở nơi khác"
      variant="warning"
      visible={visible}
      onClose={onClose}
    />
  );
}
