import { useRoomSubscription } from '@/core/socket';

import { ROOM_KIND } from '../api/meeting-room.socket';
import { useMeetingRoomStore } from '../store/meeting-room.store';
import { isInRoomPhase, isTerminalPhase } from './meeting-room.teardown';
import { useRuntimeOwner } from './use-runtime-owner';
import { useMeetingRoomEvents } from './useMeetingRoomEvents';
import { useRoomKeepAwake } from './useRoomKeepAwake';

/**
 * "Runtime" của phòng họp: socket (`meeting:*`, `call:host-action`, `call:participant-updated`…), hai phòng Socket.IO (`meet:{meetingId}` từ
 * lúc mở màn tới khi kết thúc; `call:{callId}` khi đã có phiên), giữ màn sáng. Mount ở `MeetingRoomHost` (toàn cục — sống cả khi phòng
 * THU NHỎ) và ở `MeetingRoomScreen` (dự phòng); `use-runtime-owner` bảo đảm chỉ một bản chạy.
 */
export function useMeetingRoomRuntime(): void {
  const owner = useRuntimeOwner();
  const meetingId = useMeetingRoomStore((state) => state.meetingId);
  const callId = useMeetingRoomStore((state) => state.callId);
  const phase = useMeetingRoomStore((state) => state.phase);
  const alive = owner && meetingId !== null && !isTerminalPhase(phase);

  useMeetingRoomEvents(owner);
  // Người chưa vào phòng vẫn cần `meet:` (nghe `meeting:started`/`meeting:ended`); `call:` chỉ có nghĩa khi đã có phiên.
  useRoomSubscription(ROOM_KIND.meeting, meetingId, { enabled: alive });
  useRoomSubscription(ROOM_KIND.call, callId, { enabled: alive && isInRoomPhase(phase) });
  useRoomKeepAwake(owner && (phase === 'IN_ROOM' || phase === 'RECONNECTING'));
}
