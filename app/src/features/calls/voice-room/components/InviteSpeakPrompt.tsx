import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

export interface InviteSpeakPromptProps {
  onDismiss: () => void;
  onEnableMic: () => void;
}

/** "Chủ phòng mời bạn phát biểu" + nút "Bật mic": người dùng TỰ bật (chủ phòng không bật mic hộ), nên đây chỉ là lời mời có nút tắt. */
export function InviteSpeakPrompt({ onDismiss, onEnableMic }: InviteSpeakPromptProps) {
  return (
    <Alert
      actions={
        <View className="flex-row gap-xs">
          <Button label="Bật mic" size="xs" onPress={onEnableMic} />
          <Button label="Để sau" size="xs" variant="neutral-secondary" onPress={onDismiss} />
        </View>
      }
      description="Chủ phòng mời bạn phát biểu."
      tone="info"
    />
  );
}
