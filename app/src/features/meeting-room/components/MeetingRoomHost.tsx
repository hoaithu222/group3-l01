import { router } from 'expo-router';

import { isInRoomPhase } from '../hooks/meeting-room.teardown';
import { toggleMicrophone } from '../hooks/meeting-room.devices';
import { useRegisterHost } from '../hooks/use-runtime-owner';
import { useMeetingRoomRuntime } from '../hooks/useMeetingRoomRuntime';
import { useServerNow } from '../hooks/useServerNow';
import { useMeetingRoomStore } from '../store/meeting-room.store';
import { elapsedSeconds, formatDuration } from '../utils/clock.utils';
import { isRecordingActive } from '../utils/recording-state.utils';
import { MeetingMiniBar } from './mini/MeetingMiniBar';

/**
 * Điểm gắn TOÀN CỤC của phòng họp (mount MỘT lần ở `app/(app)/_layout.tsx`, cạnh `CallHost`):
 *  · giữ "runtime" phòng — socket `meeting:*`/`call:*`, hai phòng Socket.IO, giữ màn sáng — kể cả khi màn phòng bị THU NHỎ hay đóng;
 *  · báo cho màn phòng biết đã có nơi giữ phòng (`useRegisterHost`) để hiện nút "Thu nhỏ";
 *  · vẽ `MeetingMiniBar` ("Đang họp · 12:34 · Quay lại") khi phòng đang chạy mà người dùng đã thu nhỏ.
 * Đăng xuất/đổi tài khoản: `wipeUserData()` gọi `resetMeetingRoomStores()` (bước `meetingRoom`) — ngắt media và dọn store.
 */
export function MeetingRoomHost() {
  useRegisterHost();
  useMeetingRoomRuntime();
  const meetingId = useMeetingRoomStore((state) => state.meetingId);
  const phase = useMeetingRoomStore((state) => state.phase);
  const minimized = useMeetingRoomStore((state) => state.minimized);
  const title = useMeetingRoomStore((state) => state.brief?.title);
  const micOn = useMeetingRoomStore((state) => state.micOn);
  const startedAt = useMeetingRoomStore((state) => state.startedAt);
  const recording = useMeetingRoomStore((state) =>
    isRecordingActive(state.recording) ? 'recording' : state.consentPrompt !== 'NONE' ? 'consent' : null,
  );
  const visible = minimized && meetingId !== null && isInRoomPhase(phase);
  const nowMs = useServerNow(visible);

  if (!visible) return null;

  return (
    <MeetingMiniBar
      clock={formatDuration(elapsedSeconds(startedAt, nowMs))}
      micOn={micOn}
      recording={recording}
      title={title ?? 'Cuộc họp'}
      onReturn={() => router.push({ params: { meetingId }, pathname: '/meeting-room/[meetingId]' })}
      onToggleMic={() => void toggleMicrophone()}
    />
  );
}
