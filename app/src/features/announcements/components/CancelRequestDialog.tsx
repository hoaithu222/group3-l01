import { Dialog } from '@/shared/ui/modal';

import { useCancelRequest } from '../queries/announcement-actions.queries';

export interface CancelRequestDialogProps {
  channelId: string;
  /** `null` khi không có ý định huỷ. */
  messageId: string | null;
  onClose: () => void;
  visible: boolean;
}

/**
 * "Huỷ yêu cầu xác nhận?" — huỷ nhầm là mất huy hiệu của mọi người nên có hộp thoại (không lạc quan). Đóng hộp thoại khi
 * xong DÙ thành hay bại: lỗi đã có toast (`useCancelRequest`), để hộp thoại treo lại chỉ thêm một lượt bấm thừa.
 */
export function CancelRequestDialog({
  channelId,
  messageId,
  onClose,
  visible,
}: CancelRequestDialogProps) {
  const { isPending, mutate } = useCancelRequest(channelId);

  return (
    <Dialog
      description="Tin nhắn không còn yêu cầu mọi người xác nhận đã đọc."
      dismissOnBackdrop={!isPending}
      primaryAction={{
        label: 'Huỷ yêu cầu',
        loading: isPending,
        onPress: () => messageId && mutate(messageId, { onSettled: onClose }),
      }}
      secondaryAction={{ disabled: isPending, label: 'Giữ lại', onPress: onClose }}
      title="Huỷ yêu cầu xác nhận?"
      variant="warning"
      visible={visible}
      onClose={onClose}
    />
  );
}
