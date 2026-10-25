import { Dialog } from '@/shared/ui/modal';
import { showToast } from '@/shared/utils/toast.utils';

import { useUpdateWellbeing } from '../queries/wellbeing.mutations';
import { wellbeingErrorMessage } from '../utils/wellbeing-errors';

export interface TurnOffDialogProps {
  visible: boolean;
  onClose: () => void;
  /** Đã tắt + xoá xong — nơi gọi rời màn (Cài đặt về màn Tôi; màn "chưa khả dụng" quay lại). */
  onDone: () => void;
}

/**
 * Xác nhận "Tắt theo dõi và xoá dữ liệu" (app.md p7-03 §3 "Cài đặt"). Nói rõ HẬU QUẢ trước khi bấm: ngừng thu thập, xoá ngay, không hoàn tác, bật lại thì bắt đầu từ đầu.
 * Dùng cho cả Cài đặt lẫn màn "chưa khả dụng" — `PUT optIn:false` LUÔN được BE nhận kể cả khi cờ `burnout` tắt, nên hộp thoại này không kiểm cờ.
 * Nhãn dài ⇒ xếp nút theo cột (nút chính ở trên) vì `Button` cắt nhãn ở một dòng. Lỗi ⇒ toast + đóng (bấm lại để thử) — cùng khuôn `DeleteProjectDialog`.
 * `mutateAsync` chứ không `mutate(…, { onSuccess })`: tắt xong màn cha có thể đã tháo khỏi cây (cache đổi ⇒ màn tự chuyển trạng thái), callback của `mutate` khi đó không chạy.
 */
export function TurnOffDialog({ onClose, onDone, visible }: TurnOffDialogProps) {
  const update = useUpdateWellbeing();

  const confirm = async (): Promise<void> => {
    try {
      await update.mutateAsync({ optIn: false });
    } catch (error) {
      showToast('error', wellbeingErrorMessage(error));
      onClose();
      return;
    }
    showToast('success', 'Đã tắt theo dõi và xoá dữ liệu');
    onDone();
  };

  return (
    <Dialog
      actionsDirection="column"
      description="Ứng dụng sẽ ngừng thu thập và xoá toàn bộ số liệu, đánh giá đã có của bạn ngay bây giờ. Việc này không hoàn tác được. Bạn có thể bật lại bất cứ lúc nào, nhưng sẽ bắt đầu lại từ đầu."
      dismissOnBackdrop={!update.isPending}
      primaryAction={{
        label: 'Tắt và xoá dữ liệu',
        loading: update.isPending,
        onPress: () => void confirm(),
      }}
      secondaryAction={{ disabled: update.isPending, label: 'Giữ lại', onPress: onClose }}
      title="Tắt theo dõi và xoá dữ liệu?"
      variant="warning"
      visible={visible}
      onClose={onClose}
    />
  );
}
