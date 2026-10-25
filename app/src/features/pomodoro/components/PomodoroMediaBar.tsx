import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { BottomActionBar } from '@/shared/ui/navigation';

export interface PomodoroMediaBarProps {
  cameraOn: boolean;
  /** Media chưa CONNECTED: khoá mic/camera (bật lúc chưa nối là vô nghĩa). */
  connected: boolean;
  micLocked: boolean;
  micOn: boolean;
  onLeave: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  showCamera: boolean;
  speakerOn: boolean;
}

/** Một ô điều khiển: nút (icon) + nhãn CHỮ dưới nó — nhãn luôn có, không chỉ dựa vào icon/màu. */
function Control({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View className="flex-1 items-center gap-3xs">
      {children}
      <Text className="text-center text-caption-sm text-fg-2">{label}</Text>
    </View>
  );
}

/**
 * Thanh media của phòng học (app.md p5-02 §3): mic · camera · loa · Rời. Mic bị KHOÁ khi tập trung: nút hiện icon khoá + dòng chữ "Mic tắt khi tập trung"
 * ngay trên thanh (không để người dùng bấm rồi không hiểu vì sao mic không bật). Sang nghỉ thì mở khoá nhưng KHÔNG tự bật (PM-06). Nút "Rời" luôn hiện
 * và luôn bấm được (kể cả lúc mất kết nối).
 */
export function PomodoroMediaBar(props: PomodoroMediaBarProps) {
  const { cameraOn, connected, micLocked, micOn, showCamera, speakerOn } = props;
  return (
    <BottomActionBar>
      {micLocked ? (
        <View accessibilityLiveRegion="polite" className="flex-row items-center justify-center gap-2xs pb-xs">
          <Icon color="fg-2" name="lock" size="xs" />
          <Text className="text-caption-lg font-semibold text-fg-2">Mic tắt khi tập trung</Text>
        </View>
      ) : null}
      <View className="flex-row items-start justify-center gap-xs">
        <Control label={micLocked ? 'Mic khoá' : micOn ? 'Tắt mic' : 'Bật mic'}>
          <Button
            accessibilityLabel={micLocked ? 'Micro đang bị khoá khi tập trung' : micOn ? 'Tắt micro' : 'Bật micro'}
            disabled={micLocked || !connected}
            iconLeft={micLocked ? 'lock' : 'mic-01'}
            iconOnly
            variant={micOn ? 'neutral-secondary' : 'danger-secondary'}
            onPress={props.onToggleMic}
          />
        </Control>
        {showCamera ? (
          <Control label={cameraOn ? 'Tắt camera' : 'Bật camera'}>
            <Button
              accessibilityLabel={cameraOn ? 'Tắt camera' : 'Bật camera'}
              disabled={!connected}
              iconLeft="view"
              iconOnly
              variant={cameraOn ? 'neutral-secondary' : 'danger-secondary'}
              onPress={props.onToggleCamera}
            />
          </Control>
        ) : null}
        <Control label={speakerOn ? 'Loa ngoài' : 'Loa trong'}>
          <Button
            accessibilityLabel={speakerOn ? 'Chuyển sang loa trong' : 'Bật loa ngoài'}
            disabled={!connected}
            iconLeft="audio"
            iconOnly
            variant={speakerOn ? 'primary' : 'neutral-secondary'}
            onPress={props.onToggleSpeaker}
          />
        </Control>
        <Control label="Rời">
          <Button accessibilityLabel="Rời phòng học" iconLeft="cancel" iconOnly variant="danger" onPress={props.onLeave} />
        </Control>
      </View>
    </BottomActionBar>
  );
}
