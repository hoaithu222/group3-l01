import { getDeviceId } from '@/core/device/device-id';
import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService, type JoinBody } from '../api/meeting-room.service';
import type { JoinResult, StartResult } from '../api/meeting-room.types';
import { JOIN_RETRY_DEBOUNCE_MS, JOIN_RETRY_MAX } from '../constants/meeting-room.constants';
import { meetingRoomApi, type RoomPhase } from '../store/meeting-room.store';
import { classifyJoinError, OFFLINE_MESSAGE } from '../utils/meeting-room-errors';
import { applyBrief, refreshBrief, serverOffsetOf } from './meeting-room.brief';
import { connectToRoom } from './meeting-room.session';
import { goBlocked } from './meeting-room.teardown';

/**
 * Luồng VÀO phòng (app.md §4.1): `start` (chủ trì) hoặc `join` → `WAITING_FOR_HOST` | `IN_LOBBY` | `JOINED`. Hàm thuần store/service —
 * KHÔNG phải hook (để `meeting:started`/`ADMITTED` gọi lại được từ socket handler khi màn phòng đã thu nhỏ). Lỗi nghiệp vụ là NỘI DUNG
 * màn (`JoinBlockedView`, hộp thoại chuyển cuộc gọi), không phải toast.
 */

const WAITING_PHASES: ReadonlySet<RoomPhase> = new Set<RoomPhase>(['IN_LOBBY', 'WAITING_FOR_HOST']);
/** Còn phiên đang sống ở phòng khác — mở phòng mới phải hỏi chuyển (giống `CALL_004`). */
const LIVE_PHASES: ReadonlySet<RoomPhase> = new Set<RoomPhase>(['CONNECTING', 'IN_LOBBY', 'IN_ROOM', 'RECONNECTING', 'WAITING_FOR_HOST']);

let rejoinTimer: ReturnType<typeof setTimeout> | null = null;
let rejoinAttempts = 0;

/** Mở màn cho `meetingId`: `resume` (đúng phòng đang có), `fresh` (state sạch) hoặc `switch` (đang ở phòng KHÁC — cần hỏi). */
export function beginMeeting(meetingId: string): 'fresh' | 'resume' | 'switch' {
  const state = meetingRoomApi.get();
  if (state.meetingId === meetingId) {
    meetingRoomApi.patch({ minimized: false });
    return 'resume';
  }
  if (state.meetingId && LIVE_PHASES.has(state.phase)) return 'switch';
  meetingRoomApi.reset();
  meetingRoomApi.patch({ meetingId, preJoin: { ...meetingRoomApi.get().preJoin, displayName: useAuthStore.getState().user?.name ?? '' } });
  return 'fresh';
}

function applyJoinResult(meetingId: string, result: JoinResult): void {
  const offset = serverOffsetOf(result.serverNow);
  if (result.state === 'WAITING_FOR_HOST') {
    meetingRoomApi.patch({ error: null, phase: 'WAITING_FOR_HOST', serverOffsetMs: offset, waiting: { joinOpensAt: result.joinOpensAt, startAt: result.startAt } });
  } else if (result.state === 'IN_LOBBY') {
    meetingRoomApi.patch({ error: null, phase: 'IN_LOBBY', serverOffsetMs: offset });
  } else {
    rejoinAttempts = 0;
    meetingRoomApi.applyJoined(result, offset);
    meetingRoomApi.patch({ error: null, phase: 'CONNECTING', waiting: null });
    void connectToRoom();
    void refreshBrief(meetingId); // `startedAt`/`lobbyMode` của phiên vừa bắt đầu
  }
}

interface SubmitOptions {
  /** `CALL_004` đã hỏi và người dùng đồng ý chuyển. */
  force?: boolean;
  /** Đã tự tải lại chi tiết một lần vì `RES_003` — không lặp vô hạn. */
  retried?: boolean;
}

/** Bấm nút chính ở pre-join (chủ trì + `canStart` → bắt đầu; còn lại → tham gia/xin vào). Cũng là "Thử lại" và nhịp gọi lại tự động. */
export async function submitJoin(options: SubmitOptions = {}): Promise<void> {
  const state = meetingRoomApi.get();
  const { meetingId, brief, preJoin } = state;
  if (!meetingId || state.busy) return;
  meetingRoomApi.patch({ busy: true, busyConflict: null, error: null });
  try {
    const body: JoinBody = { deviceId: await getDeviceId(), displayName: preJoin.displayName.trim() || undefined, force: options.force };
    const result: StartResult = brief?.myActions.canStart
      ? await meetingRoomService.start(meetingId, { ...body, expectedVersion: brief.version })
      : await meetingRoomService.join(meetingId, body);
    if (result.meeting) applyBrief(result.meeting);
    applyJoinResult(meetingId, result);
  } catch (error) {
    await onJoinFailure(error, meetingId, options);
  } finally {
    meetingRoomApi.patch({ busy: false });
  }
}

async function onJoinFailure(error: unknown, meetingId: string, options: SubmitOptions): Promise<void> {
  const failure = classifyJoinError(error);
  if (failure.kind === 'BLOCKED') await goBlocked(failure.code);
  else if (failure.kind === 'BUSY') meetingRoomApi.patch({ busyConflict: { sameDevice: failure.sameDevice } });
  else if (failure.kind === 'OFFLINE') meetingRoomApi.patch({ error: OFFLINE_MESSAGE });
  else if (failure.kind === 'VERSION') {
    // Chi tiết cũ (chủ trì khác vừa bắt đầu/đổi lịch): lấy bản mới rồi thử lại ĐÚNG một lần — `start` với version mới hoặc `join` vào phòng đang chạy.
    await refreshBrief(meetingId);
    if (!options.retried) {
      meetingRoomApi.patch({ busy: false });
      await submitJoin({ ...options, retried: true });
    } else meetingRoomApi.patch({ error: 'Cuộc họp vừa thay đổi. Hãy thử lại.' });
  } else {
    meetingRoomApi.patch({ error: failure.message });
    if (failure.kind === 'FORBIDDEN') await refreshBrief(meetingId); // quyền đổi → nút chính phải theo `myActions` mới
  }
}

export function clearRejoin(): void {
  if (rejoinTimer) clearTimeout(rejoinTimer);
  rejoinTimer = null;
  rejoinAttempts = 0;
}

/**
 * `meeting:started` / `meeting:lobby ADMITTED` / socket nối lại → gọi `join` lại (app.md §4.1 bước 4): gộp nhịp 300 ms, tối đa 3 lần cho
 * mỗi đợt chờ. Chỉ chạy khi còn ở phòng chờ — tín hiệu tới trễ lúc đã vào phòng/đã rời thì bỏ.
 */
export function requestRejoin(): void {
  if (rejoinTimer || !WAITING_PHASES.has(meetingRoomApi.get().phase)) return;
  rejoinTimer = setTimeout(() => {
    rejoinTimer = null;
    if (!WAITING_PHASES.has(meetingRoomApi.get().phase) || rejoinAttempts >= JOIN_RETRY_MAX) return;
    rejoinAttempts += 1;
    void submitJoin();
  }, JOIN_RETRY_DEBOUNCE_MS);
}

/** "Huỷ yêu cầu" trong phòng chờ lobby: `DELETE /lobby/me` rồi về pre-join (vẫn xin lại được). Lỗi mạng thì bỏ qua — server tự dọn theo TTL. */
export async function cancelLobbyRequest(): Promise<void> {
  const { meetingId } = meetingRoomApi.get();
  if (!meetingId) return;
  meetingRoomApi.patch({ busy: true });
  try {
    await meetingRoomHostService.cancelMyRequest(meetingId);
  } catch {
    /* server tự dọn hàng chờ theo TTL */
  }
  clearRejoin();
  meetingRoomApi.patch({ busy: false, phase: 'PREJOIN' });
}
