import { Dialog } from '@/shared/ui/modal';

export interface DeleteTaskDialogProps {
  pending: boolean;
  /** Thẻ sắp xoá; `null` = đóng. */
  task: { id: string; title: string } | null;
  onClose: () => void;
  onConfirm: (taskId: string) => void;
}

/**
 * Xác nhận xoá thẻ — dùng cho cả màn chi tiết và menu thẻ trên Kanban. Xoá là MỀM: thẻ vào thùng rác và
 * khôi phục được trong 30 ngày (`LIMITS.task.trashRetentionDays`), lịch sử hoạt động còn nguyên.
 */
export function DeleteTaskDialog({ pending, task, onClose, onConfirm }: DeleteTaskDialogProps) {
  return (
    <Dialog
      description={
        task
          ? `Thẻ "${task.title}" sẽ chuyển vào thùng rác. Bạn hoặc quản trị viên có thể khôi phục trong 30 ngày.`
          : ''
      }
      primaryAction={{
        label: 'Xoá thẻ',
        loading: pending,
        onPress: () => {
          if (task) onConfirm(task.id);
        },
      }}
      secondaryAction={{ disabled: pending, label: 'Huỷ', onPress: onClose }}
      title="Xoá thẻ?"
      variant="warning"
      visible={Boolean(task)}
      onClose={onClose}
    />
  );
}
