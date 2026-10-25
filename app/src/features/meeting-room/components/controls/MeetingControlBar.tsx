import { View } from 'react-native';

import { hapticSelection } from '@/shared/utils/haptics';

import type { RoomRole } from '../../api/meeting-room.types';
import { publishControlBarSize } from './control-bar-size';
import { RaiseHandButton } from './RaiseHandButton';
import { RoomControl } from './RoomControl';

export interface MeetingControlBarProps {
  camBusy?: boolean;
  camOn: boolean;
  /** @deprecated Chat đã lên thanh tiêu đề (`MeetingHeader`) — giữ để nơi gọi cũ không vỡ kiểu; bị bỏ qua. */
  chatBadge?: number;
  /** p2-06: đang ghi mà mình CHƯA đồng ý — mic/camera hiện KHOÁ kèm nhãn "Cần đồng ý"; bấm → `onConsentLocked` (mở lại hộp thoại đồng ý). */
  consentLocked?: boolean;
  handRaised: boolean;
  /** @deprecated Huy hiệu phòng chờ đã lên nút "Mọi người" ở `MeetingHeader` — bị bỏ qua. */
  lobbyCount?: number;
  micBusy?: boolean;
  micOn: boolean;
  onConsentLocked?: () => void;
  onLeave: () => void;
  /** @deprecated Đã lên `MeetingHeader` — bị bỏ qua. */
  onOpenChat?: () => void;
  onOpenMore: () => void;
  /** @deprecated Đã lên `MeetingHeader` — bị bỏ qua. */
  onOpenParticipants?: () => void;
  onOpenReactions: () => void;
  /** p2-06 (chủ trì/đồng chủ trì): có thì hiện nút nhanh "Dừng ghi" — chỉ truyền khi đang ghi. */
  onStopRecording?: () => void;
  onToggleCamera: () => void;
  onToggleHand: () => void;
  onToggleMic: () => void;
  /** @deprecated Đã lên `MeetingHeader` — bị bỏ qua. */
  participantCount?: number;
  /** @deprecated Thanh không còn mục riêng theo vai trò (huy hiệu phòng chờ ở `MeetingHeader`) — bị bỏ qua. */
  role?: RoomRole;
  stopRecordingBusy?: boolean;
}

/**
 * Thanh điều khiển phòng họp — MỘT hàng trên điện thoại ≥ 360dp: Mic · Camera · Giơ tay · Cảm xúc · Thêm · Rời (đỏ, cuối hàng). Chủ trì
 * đang ghi hình có thêm ô "Dừng ghi" trước Rời (ghi mà không dừng được ngay là lỗi nặng).
 *
 *  · "Chat" và "Mọi người" ở thanh tiêu đề (như Meet/Teams) — trước đây thanh có TÁM ô 64dp xếp 4 + 4 ≈ 150dp chiếm sân khấu.
 *  · "Dừng chia sẻ" KHÔNG có ô riêng: đã có trên sân khấu (`ScreenShareSpotlight`, khi CHÍNH MÌNH chia sẻ) và trong "Thêm".
 *  · Rời (đỏ đặc) đứng CUỐI, cách Mic ≥ 4 nút — bấm nhầm Rời là mất cuộc họp (app.md §7: cách nút Mic ≥ 1 nút).
 *  · Mic/Camera tắt = viền đỏ (`danger-secondary`) + nhãn "Bật mic"/"Bật video": trạng thái đọc được bằng chữ, không chỉ màu.
 *  · Không có nút "Bật mic người khác" ở đâu trong phòng (P0): chủ trì chỉ TẮT được, người kia tự bật lại.
 *
 * Hẹp (320dp + "Dừng ghi") thì `flex-wrap` xuống hàng thay vì để nút đè nhau. Nằm ngang: cha đặt thanh thành CỘT bên phải (`w-40`),
 * các ô xếp lưới 2 cột căn giữa theo chiều dọc. Kích thước đo được báo cho thanh cảm xúc nổi (`publishControlBarSize`).
 * ⛔ Nền `ink-10` cố định ở cả hai theme (thanh nằm cạnh sân khấu video tối) — xem `RoomControl`.
 */
export function MeetingControlBar(props: MeetingControlBarProps) {
  const { camBusy, camOn, consentLocked = false, handRaised, micBusy, micOn } = props;
  // Mic/camera là CÔNG TẮC ⇒ nhịp rung "chọn" ngay lúc chạm (track bật/tắt thật có thể trễ vài trăm ms). Chỉ phản hồi phía giao diện —
  // KHÔNG đụng luồng media; nút đang bận (`busy`) bị khoá nên không rung khi cú chạm không có tác dụng.
  const toggleMic = () => {
    hapticSelection();
    props.onToggleMic();
  };
  const toggleCamera = () => {
    hapticSelection();
    props.onToggleCamera();
  };

  return (
    <View
      accessibilityLabel="Điều khiển cuộc họp"
      accessibilityRole="toolbar"
      className="flex-row flex-wrap items-start justify-center gap-y-xs bg-ink-10 px-2xs pb-xs pt-sm landscape:w-40 landscape:flex-1 landscape:content-center landscape:px-xs"
      onLayout={(event) => publishControlBarSize(event.nativeEvent.layout)}
    >
      {consentLocked ? (
        <>
          <RoomControl accessibilityLabel="Micro bị khoá — cần đồng ý ghi hình để bật" icon="mic-01" label="Cần đồng ý" variant="danger-secondary" onPress={() => props.onConsentLocked?.()} />
          <RoomControl accessibilityLabel="Camera bị khoá — cần đồng ý ghi hình để bật" icon="video-camera" label="Cần đồng ý" variant="danger-secondary" onPress={() => props.onConsentLocked?.()} />
        </>
      ) : (
        <>
          <RoomControl
            accessibilityLabel={micOn ? 'Tắt micro' : 'Bật micro'}
            busy={micBusy}
            icon="mic-01"
            label={micOn ? 'Tắt mic' : 'Bật mic'}
            variant={micOn ? 'white-secondary' : 'danger-secondary'}
            onPress={toggleMic}
          />
          {/* `video-camera` (máy quay) — trước đây là `play` (tam giác phát video), đọc nhầm thành "phát/tiếp tục". Nhãn "video" (như
              Zoom) ngắn hơn "camera" để vừa MỘT dòng ở ô ~58dp; câu đọc cho trình đọc màn hình vẫn nói đủ "Tắt/Bật camera". */}
          <RoomControl
            accessibilityLabel={camOn ? 'Tắt camera' : 'Bật camera'}
            busy={camBusy}
            icon="video-camera"
            label={camOn ? 'Tắt video' : 'Bật video'}
            variant={camOn ? 'white-secondary' : 'danger-secondary'}
            onPress={toggleCamera}
          />
        </>
      )}
      <RaiseHandButton raised={handRaised} onToggle={props.onToggleHand} />
      <RoomControl accessibilityLabel="Gửi cảm xúc" icon="favorite" label="Cảm xúc" onPress={props.onOpenReactions} />
      <RoomControl accessibilityLabel="Thêm tuỳ chọn" icon="more" label="Thêm" onPress={props.onOpenMore} />
      {props.onStopRecording ? (
        <RoomControl accessibilityLabel="Dừng ghi hình cuộc họp" busy={props.stopRecordingBusy} icon="pause" label="Dừng ghi" variant="danger-secondary" onPress={props.onStopRecording} />
      ) : null}
      <RoomControl accessibilityLabel="Rời cuộc họp" icon="logout" label="Rời" variant="danger" onPress={props.onLeave} />
    </View>
  );
}
