import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';

import { CallControl } from '../../components/CallControl';
import { RaiseHandButton } from './RaiseHandButton';

/** Rung TRƯỚC (phản hồi tức thì của cú chạm), việc thật chạy sau — bật/tắt = `hapticSelection`, Rời phòng = `hapticTap`. */
const withHaptic = (haptic: () => void, action: () => void) => () => {
  haptic();
  action();
};

export interface VoiceRoomControlsProps {
  audioBlocked: boolean;
  cameraOn: boolean;
  handRaised: boolean;
  micOn: boolean;
  onLeave: () => void;
  onOpenChat?: () => void;
  onOpenParticipants: () => void;
  onToggleCamera: () => void;
  onToggleHand: () => void;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  participantCount: number;
  /** Kênh cho video và chủ phòng chưa tắt video — có thì hiện nút camera. */
  showCamera: boolean;
  speakerOn: boolean;
}

/**
 * Thanh điều khiển phòng thoại, HAI tầng như `ActiveCallControls`: hàng bật/tắt (mic · loa · camera · giơ tay · mọi người · chat — xuống dòng khi
 * hẹp) rồi nút Rời đứng riêng, to hơn, bên dưới (không lẫn giữa các nút bật/tắt, không rơi lẻ ở hàng cuối). Mỗi nút có nhãn CHỮ (CallControl).
 * Mic bị chủ phòng chặn thì KHOÁ và đổi nhãn ("Bị chặn") — không để người dùng bấm rồi không hiểu vì sao mic không bật. `onOpenChat` vắng
 * (không có chat được nối) thì ẩn nút Chat.
 */
export function VoiceRoomControls(props: VoiceRoomControlsProps) {
  const { audioBlocked, cameraOn, handRaised, micOn, participantCount, showCamera, speakerOn } = props;
  return (
    <View className="items-center gap-lg px-lg pb-xl">
      <View className="flex-row flex-wrap items-start justify-center gap-md">
        <CallControl label={audioBlocked ? 'Bị chặn' : micOn ? 'Tắt mic' : 'Bật mic'}>
          <Button
            accessibilityLabel={audioBlocked ? 'Micro bị chủ phòng chặn' : micOn ? 'Tắt micro' : 'Bật micro'}
            disabled={audioBlocked}
            iconLeft="mic-01"
            iconOnly
            variant={micOn ? 'neutral-secondary' : 'danger-secondary'}
            onPress={withHaptic(hapticSelection, props.onToggleMic)}
          />
        </CallControl>
        <CallControl label={speakerOn ? 'Loa ngoài' : 'Loa trong'}>
          <Button
            accessibilityLabel={speakerOn ? 'Chuyển sang loa trong' : 'Bật loa ngoài'}
            iconLeft="audio"
            iconOnly
            variant={speakerOn ? 'primary' : 'neutral-secondary'}
            onPress={withHaptic(hapticSelection, props.onToggleSpeaker)}
          />
        </CallControl>
        {/* `video-camera` — cùng icon camera của `ActiveCallControls` (bản cũ dùng `play`, đọc ra là "phát" chứ không phải "camera"). */}
        {showCamera ? (
          <CallControl label={cameraOn ? 'Tắt camera' : 'Bật camera'}>
            <Button
              accessibilityLabel={cameraOn ? 'Tắt camera' : 'Bật camera'}
              iconLeft="video-camera"
              iconOnly
              variant={cameraOn ? 'neutral-secondary' : 'danger-secondary'}
              onPress={withHaptic(hapticSelection, props.onToggleCamera)}
            />
          </CallControl>
        ) : null}
        <RaiseHandButton raised={handRaised} onToggle={props.onToggleHand} />
        <CallControl label={`Mọi người (${String(participantCount)})`}>
          <Button
            accessibilityLabel={`Danh sách người tham gia, ${String(participantCount)} người`}
            iconLeft="contact-list"
            iconOnly
            variant="neutral-secondary"
            onPress={props.onOpenParticipants}
          />
        </CallControl>
        {props.onOpenChat ? (
          <CallControl label="Chat">
            <Button accessibilityLabel="Mở chat của phòng" iconLeft="chat-bubble" iconOnly variant="neutral-secondary" onPress={props.onOpenChat} />
          </CallControl>
        ) : null}
      </View>
      <CallControl label="Rời">
        <Button
          accessibilityLabel="Rời phòng"
          iconLeft="cancel"
          iconOnly
          size="lg"
          variant="danger"
          onPress={withHaptic(hapticTap, props.onLeave)}
        />
      </CallControl>
    </View>
  );
}
