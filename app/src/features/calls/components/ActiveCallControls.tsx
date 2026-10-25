import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';

import { CallControl } from './CallControl';

export interface ActiveCallControlsProps {
  cameraOn: boolean;
  micOn: boolean;
  onFlipCamera: () => void;
  onHangUp: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  speakerOn: boolean;
  video: boolean;
}

/** Bọc một thao tác bằng nhịp rung tương ứng — rung TRƯỚC (phản hồi tức thì của cú chạm), việc thật chạy sau. */
const withHaptic = (haptic: () => void, action: () => void) => () => {
  haptic();
  action();
};

/**
 * Điều khiển trong cuộc gọi, HAI tầng: hàng bật/tắt (mic · loa · camera + đổi camera khi gọi video) rồi nút Kết thúc đứng riêng bên dưới.
 * Mỗi nút có nhãn chữ dưới icon. Tách Kết thúc khỏi hàng chung vì (1) gọi video có tới 5 ô ≈ 335dp — máy 360dp không vừa nên ô CUỐI (chính là
 * Kết thúc) rơi lẻ xuống hàng hai, (2) nút "gác máy" nằm liền kề nút mic là chỗ dễ bấm nhầm nhất; đứng riêng, to hơn (`lg`) thì vừa nổi bật
 * vừa cách xa các nút bật/tắt.
 *
 * Rung: bật/tắt (mic, loa, camera, đổi camera) = `hapticSelection` — người dùng thường KHÔNG nhìn màn khi đang nói, rung cho biết cú chạm
 * đã nhận; Kết thúc = `hapticTap` (hành động chính, dứt khoát hơn).
 */
export function ActiveCallControls(props: ActiveCallControlsProps) {
  const {
    cameraOn,
    micOn,
    onFlipCamera,
    onHangUp,
    onToggleCamera,
    onToggleMic,
    onToggleSpeaker,
    speakerOn,
    video,
  } = props;
  return (
    <View className="items-center gap-lg px-lg pb-xl">
      <View className="flex-row flex-wrap items-start justify-center gap-md">
        <CallControl label={micOn ? 'Tắt mic' : 'Bật mic'}>
          <Button
            accessibilityLabel={micOn ? 'Tắt micro' : 'Bật micro'}
            iconLeft="mic-01"
            iconOnly
            variant={micOn ? 'neutral-secondary' : 'danger-secondary'}
            onPress={withHaptic(hapticSelection, onToggleMic)}
          />
        </CallControl>
        <CallControl label={speakerOn ? 'Loa ngoài' : 'Loa trong'}>
          <Button
            accessibilityLabel={speakerOn ? 'Chuyển sang loa trong' : 'Bật loa ngoài'}
            iconLeft="audio"
            iconOnly
            variant={speakerOn ? 'primary' : 'neutral-secondary'}
            onPress={withHaptic(hapticSelection, onToggleSpeaker)}
          />
        </CallControl>
        {video ? (
          <>
            <CallControl label={cameraOn ? 'Tắt camera' : 'Bật camera'}>
              <Button
                accessibilityLabel={cameraOn ? 'Tắt camera' : 'Bật camera'}
                iconLeft="video-camera"
                iconOnly
                variant={cameraOn ? 'neutral-secondary' : 'danger-secondary'}
                onPress={withHaptic(hapticSelection, onToggleCamera)}
              />
            </CallControl>
            <CallControl label="Đổi camera">
              <Button
                accessibilityLabel="Đổi camera trước/sau"
                disabled={!cameraOn}
                iconLeft="reload"
                iconOnly
                variant="neutral-secondary"
                onPress={withHaptic(hapticSelection, onFlipCamera)}
              />
            </CallControl>
          </>
        ) : null}
      </View>
      <CallControl label="Kết thúc">
        <Button
          accessibilityLabel="Kết thúc cuộc gọi"
          iconLeft="cancel"
          iconOnly
          size="lg"
          variant="danger"
          onPress={withHaptic(hapticTap, onHangUp)}
        />
      </CallControl>
    </View>
  );
}
