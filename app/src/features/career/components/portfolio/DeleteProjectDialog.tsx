import { Dialog } from '@/shared/ui/modal';
import { showToast } from '@/shared/utils/toast.utils';

import { useDeleteProject } from '../../queries/portfolio-project.mutations';
import { isGone, portfolioErrorMessage } from '../../utils/portfolio-errors';

export interface DeleteProjectDialogProps {
  projectId: string;
  title: string;
  visible: boolean;
  onClose: () => void;
  /** Đã xoá xong — màn cha quay lại danh sách. */
  onDeleted: () => void;
}

/**
 * Xác nhận "Xoá khỏi hồ sơ" (app.md p6-07 §3 "Sửa dự án", `Dialog`). Nói rõ phạm vi để người dùng không sợ mất dữ liệu nhóm: chỉ gỡ dự án khỏi HỒ SƠ portfolio, task và nhóm
 * của bạn còn nguyên, và thêm lại được (số liệu chụp lại lúc thêm). Lỗi ⇒ toast + đóng hộp thoại (thao tác dứt điểm, không cần giữ ngữ cảnh).
 */
export function DeleteProjectDialog({
  onClose,
  onDeleted,
  projectId,
  title,
  visible,
}: DeleteProjectDialogProps) {
  const remove = useDeleteProject();

  // `mutateAsync` chứ không `mutate(…, { onSuccess })`: hook xoá dự án khỏi cache NGAY khi thành công, màn cha có thể tháo khỏi cây trước khi callback của `mutate`
  // kịp chạy (callback đó chỉ chạy khi component còn mount) — toast + quay lại sẽ bị nuốt. Promise thì luôn được xử lý tiếp.
  const confirm = async (): Promise<void> => {
    try {
      await remove.mutateAsync(projectId);
    } catch (error) {
      // 404: dự án đã bị xoá ở nơi khác — kết quả người dùng muốn đã có, chỉ cần báo và rời màn.
      if (isGone(error)) {
        showToast('error', 'Dự án không còn');
        onDeleted();
        return;
      }
      showToast('error', portfolioErrorMessage(error));
      onClose();
      return;
    }
    showToast('success', 'Đã xoá dự án khỏi hồ sơ');
    onDeleted();
  };

  return (
    <Dialog
      description={`“${title}” chỉ bị gỡ khỏi hồ sơ portfolio. Task và nhóm của bạn không bị xoá, và bạn có thể thêm lại dự án này sau.`}
      dismissOnBackdrop={!remove.isPending}
      primaryAction={{
        label: 'Xoá khỏi hồ sơ',
        loading: remove.isPending,
        onPress: () => void confirm(),
      }}
      secondaryAction={{ disabled: remove.isPending, label: 'Huỷ', onPress: onClose }}
      title="Xoá dự án khỏi hồ sơ?"
      variant="warning"
      visible={visible}
      onClose={onClose}
    />
  );
}
