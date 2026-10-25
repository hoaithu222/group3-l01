import { Dialog } from '@/shared/ui/modal';

/** `MOCK_002`: đã có lượt thi đang dở của bộ này — mở lại lượt đó hay ở lại (app.md p4-02 §2). */
export function ResumeAttemptDialog({
  onClose,
  onResume,
  visible,
}: {
  onClose: () => void;
  onResume: () => void;
  visible: boolean;
}) {
  return (
    <Dialog
      description="Bạn còn một lượt thi thử đang làm dở của bộ này. Tiếp tục lượt đó trước khi bắt đầu lượt mới."
      primaryAction={{ label: 'Tiếp tục làm', onPress: onResume }}
      secondaryAction={{ label: 'Để sau', onPress: onClose }}
      title="Đang có lượt thi dở"
      visible={visible}
      onClose={onClose}
    />
  );
}
