import { Dialog } from '@/shared/ui/modal';

interface AbortSessionDialogProps {
  /** Đang ở sảnh chờ ⇒ "Huỷ phòng"; đang thi ⇒ "Kết thúc phiên". */
  lobby: boolean;
  pending: boolean;
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Hộp xác nhận thao tác PHÁ HUỶ của chủ phòng — ảnh hưởng mọi người chơi nên luôn hỏi lại, không có nút đỏ nằm sẵn ở thanh đáy. */
export function AbortSessionDialog({
  lobby,
  onClose,
  onConfirm,
  pending,
  visible,
}: AbortSessionDialogProps) {
  return (
    <Dialog
      description={
        lobby
          ? 'Phòng sẽ bị huỷ và người chơi đã vào sẽ bị mời ra.'
          : 'Phiên thi kết thúc ngay với tất cả người chơi.'
      }
      primaryAction={{
        label: lobby ? 'Huỷ phòng' : 'Kết thúc phiên',
        loading: pending,
        onPress: onConfirm,
      }}
      secondaryAction={{ label: 'Không', onPress: onClose }}
      title={lobby ? 'Huỷ phòng thi?' : 'Kết thúc phiên thi?'}
      variant="warning"
      visible={visible}
      onClose={onClose}
    />
  );
}
