import { useEffect } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

/** Lời nhắc tự ẩn sau 10 giây (app.md §3) — chủ phòng chỉ ĐỀ NGHỊ, không ép; bỏ qua cũng không sao. */
export const MUTE_REQUEST_VISIBLE_MS = 10_000;

export interface MuteRequestPromptProps {
  onDismiss: () => void;
  onMute: () => void;
}

/** "Chủ phòng đề nghị bạn tắt mic" [Tắt mic] [Bỏ qua] — gọi bộ điều khiển media của máy này, KHÔNG có quyền tắt hộ từ xa. */
export function MuteRequestPrompt({ onDismiss, onMute }: MuteRequestPromptProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, MUTE_REQUEST_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <Alert
      actions={
        <View className="flex-row gap-xs">
          <Button label="Tắt mic" size="xs" onPress={onMute} />
          <Button label="Bỏ qua" size="xs" variant="neutral-secondary" onPress={onDismiss} />
        </View>
      }
      description="Chủ phòng đề nghị bạn tắt mic."
      tone="info"
    />
  );
}
