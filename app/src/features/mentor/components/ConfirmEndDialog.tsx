import { Dialog } from '@/shared/ui/modal';

export interface ConfirmEndDialogProps {
  busy?: boolean;
  /** `mentor` = cố vấn tự rời; `team` = nhóm kết thúc đợt của một cố vấn. */
  perspective: 'mentor' | 'team';
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Xác nhận kết thúc đợt cố vấn (app.md §3 "Kết thúc cố vấn có xác nhận") — hậu quả nói rõ bằng chữ. */
export function ConfirmEndDialog({
  busy,
  onCancel,
  onConfirm,
  perspective,
  visible,
}: ConfirmEndDialogProps) {
  return (
    <Dialog
      description={
        perspective === 'mentor'
          ? 'Bạn sẽ rời nhóm và nhóm chat cố vấn ngay. Tin nhắn cũ vẫn được giữ.'
          : 'Cố vấn mất quyền vào nhóm, kênh và nhóm chat ngay. Tin nhắn cũ vẫn được giữ.'
      }
      primaryAction={{ label: 'Kết thúc', loading: busy, onPress: onConfirm }}
      secondaryAction={{ label: 'Huỷ', onPress: onCancel }}
      title={perspective === 'mentor' ? 'Kết thúc cố vấn?' : 'Kết thúc đợt cố vấn?'}
      variant="warning"
      visible={visible}
      onClose={onCancel}
    />
  );
}
