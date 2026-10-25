import { meetingRoomService } from '../api/meeting-room.service';
import type { BlockedCode } from '../api/meeting-room.types';
import { getMeetingMedia } from '../media/meeting-media.registry';
import { meetingRoomApi, type MeetingRoomState, type RoomPhase } from '../store/meeting-room.store';
import { elapsedSeconds } from '../utils/clock.utils';
import { clearTimers, nextGeneration, setMediaBinding } from './meeting-room.runtime-state';

/**
 * Ngắt phiên + các đích kết thúc của máy trạng thái (app.md §3.1: `ENDED`, `REMOVED`, `BLOCKED`). Mỗi đích GHI PHA TRƯỚC (đồng bộ) rồi mới
 * ngắt media (bất đồng bộ) — hai tín hiệu tới sát nhau (socket `meeting:ended` + LiveKit `room-closed`) không thể cùng qua cổng "chưa
 * kết thúc"; tín hiệu tới sau chỉ được BỔ SUNG lý do còn thiếu.
 */

const TERMINAL: ReadonlySet<RoomPhase> = new Set<RoomPhase>(['BLOCKED', 'ENDED', 'REMOVED']);
export const isTerminalPhase = (phase: RoomPhase): boolean => TERMINAL.has(phase);

/** Đã có kết nối/đang nối media (khác pre-join/phòng chờ) — quyết định "kết thúc" hay "không vào được". */
export const isInRoomPhase = (phase: RoomPhase): boolean =>
  phase === 'CONNECTING' || phase === 'IN_ROOM' || phase === 'RECONNECTING';

/** Idempotent: huỷ lượt chờ kết nối cũ, hạ đếm giờ, gỡ người nghe media rồi ngắt (không giữ camera/mic sau khi rời — VC-07). */
export async function teardownMeetingSession(): Promise<void> {
  nextGeneration();
  clearTimers();
  setMediaBinding(null);
  await getMeetingMedia().disconnect().catch(() => undefined);
}

/**
 * `POST /meetings/:id/leave` (idempotent) có thử lại — báo server rời phòng khi ta đã ngắt media. Lỗi thì bỏ qua: server tự dọn theo
 * webhook LiveKit `participant_left`.
 */
export async function leaveQuietly(meetingId: string, transferControlTo?: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await meetingRoomService.leave(meetingId, transferControlTo);
      return true;
    } catch {
      await new Promise<void>((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  return false;
}

/** Dọn phần chỉ có nghĩa khi còn ở trong phòng (danh sách người, cảm xúc bay, sheet đang mở, vé kết nối). */
const cleared = (): Partial<MeetingRoomState> => ({ closingAt: null, participants: [], reactions: [], sheet: 'NONE', ticket: null });

/** Cuộc họp kết thúc CHO MÌNH (chủ trì kết thúc, hết giờ, đóng phòng, bị chuyển máy). `durationSec` thiếu → tính từ `startedAt`. */
export async function goEnded(reason: string | null, durationSec: number | null = null): Promise<void> {
  const state = meetingRoomApi.get();
  if (isTerminalPhase(state.phase)) {
    if (state.phase === 'ENDED' && state.endedReason === null && reason) meetingRoomApi.patch({ endedReason: reason });
    return;
  }
  const now = Date.now() + state.serverOffsetMs;
  meetingRoomApi.patch({
    ...cleared(),
    busy: false,
    connection: 'disconnected',
    endedDurationSec: durationSec ?? elapsedSeconds(state.startedAt, now),
    endedReason: reason,
    minimized: false,
    phase: 'ENDED',
  });
  await teardownMeetingSession();
}

/** Bị mời ra khỏi phiên họp (`call:host-action REMOVED` hoặc LiveKit `removed`). */
export async function goRemoved(): Promise<void> {
  if (isTerminalPhase(meetingRoomApi.get().phase)) return;
  meetingRoomApi.patch({ ...cleared(), busy: false, connection: 'disconnected', minimized: false, phase: 'REMOVED' });
  await teardownMeetingSession();
}

/** Không vào được / mất quyền / chủ trì từ chối (`JoinBlockedView`). */
export async function goBlocked(code: BlockedCode): Promise<void> {
  if (isTerminalPhase(meetingRoomApi.get().phase)) return;
  meetingRoomApi.patch({ ...cleared(), blockedCode: code, busy: false, connection: 'idle', minimized: false, phase: 'BLOCKED' });
  await teardownMeetingSession();
}

/** Nối media hỏng hẳn (hết lượt thử/quá hạn mất mạng): về pre-join có nút "Thử lại", báo server rời để không kẹt trạng thái `JOINING`. */
export async function failToPrejoin(message: string): Promise<void> {
  const { meetingId, phase } = meetingRoomApi.get();
  if (isTerminalPhase(phase)) return;
  meetingRoomApi.patch({ ...cleared(), busy: false, callId: null, connection: 'idle', error: message, phase: 'PREJOIN' });
  await teardownMeetingSession();
  if (meetingId) void leaveQuietly(meetingId);
}
