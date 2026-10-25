import { Dialog } from '@/shared/ui/modal';
import { showToast } from '@/shared/utils/toast.utils';

import { useUnpublishPortfolio } from '../../queries/portfolio.mutations';
import { portfolioErrorMessage } from '../../utils/portfolio-errors';

export interface UnpublishDialogProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Xác nhận "Ngừng công khai" (app.md p6-07 §3). ⚠️ Nói THẬT về độ trễ: BE trả 404 ngay nhưng nginx giữ bản cache tối đa 5 phút (README §10) — hứa "biến mất ngay" là nói dối,
 * và người dùng sẽ tưởng ngừng công khai không có tác dụng khi tự mở lại link thấy trang còn đó. Lỗi ⇒ toast + đóng hộp thoại.
 */
export function UnpublishDialog({ onClose, visible }: UnpublishDialogProps) {
  const unpublish = useUnpublishPortfolio();

  const confirm = () =>
    unpublish.mutate(undefined, {
      onError: (error) => {
        showToast('error', portfolioErrorMessage(error));
        onClose();
      },
      onSuccess: () => {
        showToast('success', 'Đã ngừng công khai hồ sơ');
        onClose();
      },
    });

  return (
    <Dialog
      description="Trang sẽ ngừng hiển thị, có thể còn thấy tối đa 5 phút trên một số trình duyệt. Hồ sơ và dự án của bạn được giữ nguyên, bạn công khai lại lúc nào cũng được."
      dismissOnBackdrop={!unpublish.isPending}
      primaryAction={{ label: 'Ngừng công khai', loading: unpublish.isPending, onPress: confirm }}
      secondaryAction={{ disabled: unpublish.isPending, label: 'Giữ công khai', onPress: onClose }}
      title="Ngừng công khai hồ sơ?"
      variant="warning"
      visible={visible}
      onClose={onClose}
    />
  );
}
