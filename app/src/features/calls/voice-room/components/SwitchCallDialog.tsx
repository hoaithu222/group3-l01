import { Dialog } from '@/shared/ui/modal';

import type { SwitchPrompt } from '../hooks/useJoinVoiceRoom';

export interface SwitchCallDialogProps {
  onConfirm: () => void;
  onDismiss: () => void;
  prompt: SwitchPrompt | null;
}

/**
 * "Chuyển cuộc gọi sang đây" (app.md §3): hỏi TRƯỚC khi đá máy cũ/rời cuộc gọi khác — người dùng phải thấy hậu quả, không tự chuyển.
 * `Dialog` (chặn luồng, phải quyết định), nút chính là hành động chuyển; đóng = ở lại như cũ.
 */
export function SwitchCallDialog({ onConfirm, onDismiss, prompt }: SwitchCallDialogProps) {
  if (!prompt) return null;
  const sameRoom = prompt.kind === 'SAME_ROOM_OTHER_DEVICE';
  const other = prompt.title ? `cuộc gọi với ${prompt.title}` : 'một cuộc gọi khác';
  return (
    <Dialog
      description={
        sameRoom
          ? 'Bạn đang ở phòng này trên thiết bị khác. Chuyển sang máy này sẽ ngắt máy kia.'
          : `Bạn đang trong ${other}. Rời cuộc gọi đó và vào phòng này?`
      }
      primaryAction={{ label: sameRoom ? 'Chuyển sang máy này' : 'Rời và vào phòng', onPress: onConfirm }}
      secondaryAction={{ label: 'Ở lại', onPress: onDismiss }}
      title="Chuyển cuộc gọi sang đây"
      variant="warning"
      visible
      onClose={onDismiss}
    />
  );
}
