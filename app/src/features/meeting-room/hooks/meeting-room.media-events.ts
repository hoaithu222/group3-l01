import { queryClient } from '@/core/config/query-client';
import type { CallMediaDisconnectReason } from '@/core/media/call-media.types';

import { meetingRoomKeys } from '../api/meeting-room.keys';
import { meetingRoomService } from '../api/meeting-room.service';
import type { MeetingMediaEvent, MeetingMediaParticipant } from '../media/meeting-media.types';
import { meetingRoomApi } from '../store/meeting-room.store';
import { reconcileHand } from './meeting-room.hand';
import { applyServerRecording } from './meeting-room.recording';
import { clearGrace, scheduleTokenRenew, startGrace } from './meeting-room.runtime-state';
import { failToPrejoin, goEnded, goRemoved, isInRoomPhase } from './meeting-room.teardown';

/** Phần controller cần từ ngoài (tiêm vào để `media-events` không import ngược `session` — tránh vòng phụ thuộc). */
export interface MediaEventDeps {
  reconnect: () => Promise<void>;
}

export const GRACE_MESSAGE = 'Mất kết nối quá lâu nên bạn đã ra khỏi phòng họp. Hãy thử vào lại.';

let reactionSeq = 0;

/**
 * Tải lại ảnh chụp phòng rồi ĐỐI SOÁT vai trò của mình, khoá phòng và cảnh báo sắp đóng (có thể đã lỡ socket lúc mất mạng). Chỉ đường này ghi
 * store — `useRoomSnapshot` (người xem danh sách) đọc cùng cache nên tự thấy bản mới; vá tại chỗ từ `call:participant-updated` không đụng store.
 */
export async function refreshRoomSnapshot(): Promise<void> {
  const meetingId = meetingRoomApi.get().meetingId;
  if (!meetingId) return;
  try {
    const snapshot = await queryClient.fetchQuery({
      queryFn: () => meetingRoomService.snapshot(meetingId),
      queryKey: meetingRoomKeys.room(meetingId),
      staleTime: 0,
    });
    const { meetingId: current, role } = meetingRoomApi.get();
    if (current !== meetingId) return;
    meetingRoomApi.patch({
      closingAt: snapshot.closingAt,
      lockedAt: snapshot.lockedAt,
      ...(snapshot.myRole && snapshot.myRole !== role ? { role: snapshot.myRole } : {}),
    });
    // p2-06: chỉ báo ghi hình + "mình đã đồng ý chưa" theo server sau mỗi lần đồng bộ (reconnect, lỡ sự kiện — RR-19).
    applyServerRecording(snapshot.recording);
  } catch {
    /* giữ dữ liệu cũ — lần đồng bộ sau sẽ thử lại */
  }
}

/** Vào phòng (lần đầu hoặc sau khi nối lại): idempotent, KHÔNG đè các pha kết thúc. */
export function enterRoom(): void {
  const { phase } = meetingRoomApi.get();
  if (phase !== 'CONNECTING' && phase !== 'RECONNECTING') return;
  clearGrace();
  meetingRoomApi.patch({ connection: 'connected', phase: 'IN_ROOM' });
  scheduleTokenRenew();
  void refreshRoomSnapshot();
}

/**
 * Mic/camera/chia sẻ của MÌNH lấy từ người cục bộ trong danh sách — nút trên thanh điều khiển luôn theo track thật (app.md §3.2). Giơ tay
 * thì KHÔNG đè thẳng: lúc đang chờ LiveKit xác nhận, attribute trong snapshot còn là giá trị CŨ ⇒ `reconcileHand` giữ ý định của mình.
 */
function applyParticipants(participants: MeetingMediaParticipant[]): void {
  const local = participants.find((p) => p.isLocal);
  meetingRoomApi.patch({
    camOn: local?.cameraEnabled ?? false,
    micOn: local?.micEnabled ?? false,
    screenSharing: !!local?.screenShareRef,
    ...reconcileHand(participants),
  });
}

/** Mất mạng tạm thời (SDK tự nối lại): giữ phòng, hiện banner; quá `RECONNECT_GRACE_MS` mà chưa nối lại được thì về pre-join. */
function onReconnecting(): void {
  if (meetingRoomApi.get().phase !== 'IN_ROOM') return;
  meetingRoomApi.patch({ connection: 'reconnecting', phase: 'RECONNECTING' });
  startGrace(() => void failToPrejoin(GRACE_MESSAGE));
}

async function onDisconnected(reason: CallMediaDisconnectReason, deps: MediaEventDeps): Promise<void> {
  // `client` = CHÍNH MÌNH vừa ngắt; ngoài phòng (pre-join/chờ/đã kết thúc) thì không có gì để khôi phục.
  if (reason === 'client' || !isInRoomPhase(meetingRoomApi.get().phase)) return;
  if (reason === 'duplicate-identity') await goEnded('MOVED_DEVICE');
  else if (reason === 'removed') await goRemoved();
  else if (reason === 'room-closed') await goEnded(null);
  else await deps.reconnect();
}

/** Sự kiện `MeetingMediaPort` → store (app.md §4.3 dòng "Room"). Người nghe MỘT phiên, do `session` đăng ký và gỡ khi ngắt. */
export function createMediaEventHandler(deps: MediaEventDeps): (event: MeetingMediaEvent) => void {
  return (event) => {
    switch (event.type) {
      case 'participants':
        applyParticipants(event.participants);
        break;
      case 'connected':
      case 'reconnected':
        enterRoom();
        break;
      case 'reconnecting':
        onReconnecting();
        break;
      case 'disconnected':
        void onDisconnected(event.reason, deps);
        break;
      case 'reaction':
        reactionSeq += 1;
        meetingRoomApi.addReaction({ at: event.at, emoji: event.emoji, id: `${event.identity}:${event.at}:${reactionSeq}`, identity: event.identity });
        break;
    }
  };
}
