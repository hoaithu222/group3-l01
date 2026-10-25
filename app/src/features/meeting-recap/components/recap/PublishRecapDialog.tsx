import { Dialog } from '@/shared/ui/modal';

export interface PublishRecapDialogProps {
  /** Đã công bố trước đó → "Cập nhật biên bản đã công bố" (sửa thẻ trong nhóm chat, không thông báo lại). */
  republish: boolean;
  loading: boolean;
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Xác nhận công bố (app.md §3 `PublishRecapDialog`): nói rõ HẬU QUẢ trước khi bấm — mọi người trong cuộc họp nhận thông báo và biên bản
 * được đăng vào nhóm chat. Công bố lại: chỉ cập nhật thẻ đã đăng, không gửi thông báo lần nữa (BE `firstPublish`).
 */
export function PublishRecapDialog({ loading, republish, visible, onCancel, onConfirm }: PublishRecapDialogProps) {
  return (
    <Dialog
      actionsDirection="column"
      description={
        republish
          ? 'Thẻ biên bản trong nhóm chat sẽ được cập nhật theo nội dung mới. Mọi người không nhận thêm thông báo.'
          : 'Mọi người trong cuộc họp sẽ nhận thông báo và biên bản được đăng vào nhóm chat.'
      }
      dismissOnBackdrop={!loading}
      primaryAction={{ label: republish ? 'Cập nhật biên bản' : 'Công bố biên bản', loading, onPress: onConfirm }}
      secondaryAction={{ disabled: loading, label: 'Để sau', onPress: onCancel }}
      title={republish ? 'Cập nhật biên bản đã công bố?' : 'Công bố biên bản?'}
      visible={visible}
      onClose={onCancel}
    />
  );
}
