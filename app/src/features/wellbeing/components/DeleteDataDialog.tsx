import { Dialog } from '@/shared/ui/modal';
import { showToast } from '@/shared/utils/toast.utils';

import { useDeleteWellbeingData } from '../queries/wellbeing.mutations';
import { wellbeingErrorMessage } from '../utils/wellbeing-errors';

export interface DeleteDataDialogProps {
  visible: boolean;
  onClose: () => void;
  /** Đã xoá xong (tuỳ chọn) — Cài đặt không cần rời màn, chỉ cần đóng hộp thoại. */
  onDone?: () => void;
}

/**
 * Xác nhận "Xoá dữ liệu đã thu thập" (app.md p7-03 §3): xoá số liệu + đánh giá nhưng GIỮ trạng thái bật — khác "Tắt và xoá". Nói rõ hai điều người dùng hay nhầm: xoá là vĩnh viễn, và theo dõi
 * VẪN bật nên sẽ thu thập lại từ bây giờ (muốn dừng hẳn thì tắt). `DELETE …/data` luôn dùng được, kể cả khi cờ `burnout` tắt. Lỗi ⇒ toast + đóng.
 */
export function DeleteDataDialog({ onClose, onDone, visible }: DeleteDataDialogProps) {
  const remove = useDeleteWellbeingData();

  const confirm = async (): Promise<void> => {
    try {
      await remove.mutateAsync();
    } catch (error) {
      showToast('error', wellbeingErrorMessage(error));
      onClose();
      return;
    }
    showToast('success', 'Đã xoá dữ liệu đã thu thập');
    onClose();
    onDone?.();
  };

  return (
    <Dialog
      actionsDirection="column"
      description="Toàn bộ số liệu và đánh giá đã có sẽ bị xoá ngay và không thể khôi phục. Theo dõi vẫn đang bật nên ứng dụng sẽ thu thập lại từ bây giờ. Muốn dừng hẳn, hãy tắt theo dõi."
      dismissOnBackdrop={!remove.isPending}
      primaryAction={{
        label: 'Xoá dữ liệu',
        loading: remove.isPending,
        onPress: () => void confirm(),
      }}
      secondaryAction={{ disabled: remove.isPending, label: 'Huỷ', onPress: onClose }}
      title="Xoá dữ liệu đã thu thập?"
      variant="warning"
      visible={visible}
      onClose={onClose}
    />
  );
}
