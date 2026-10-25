import { getCallMedia } from '@/core/media/call-media.registry';
import { MediaUnavailableError, type CallMediaDisconnectReason, type CallMediaEvent } from '@/core/media/call-media.types';
import { showToast } from '@/shared/utils/toast.utils';

import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroJoinResult } from '../api/pomodoro.types';
import { EMPTY_ROOM, usePomodoroStore } from '../store/pomodoro.store';

/**
 * Cầu nối `pomodoro.store.room` ⇄ `CallMediaPort` — KHÔNG phải hook để vòng đời media không dính vào vòng đời render (mẫu của
 * `calls/hooks/call-session.controller.ts`). `PomodoroRoomScreen` gọi `connectPomodoroSession`/`leavePomodoroRoom`; đăng xuất gọi
 * `teardownPomodoroSession` qua `resetPomodoroStores`.
 *
 * Vào phòng luôn với mic/camera TẮT (app.md §3 "mic tắt mặc định"): quyền hệ điều hành chỉ xin khi người dùng BẤM bật (`usePomodoroMedia`).
 */
const MAX_ATTEMPTS = 3;
/** Mất kết nối quá lâu thì rời hẳn (app.md §3: "overlay 'Đang kết nối lại' 30 s → về preview"). */
export const RECONNECT_GRACE_MS = 30_000;

let unsubscribe: (() => void) | null = null;
let generation = 0;
let graceTimer: ReturnType<typeof setTimeout> | null = null;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function clearGrace(): void {
  if (graceTimer !== null) clearTimeout(graceTimer);
  graceTimer = null;
}

function armGrace(): void {
  clearGrace();
  graceTimer = setTimeout(() => {
    graceTimer = null;
    if (usePomodoroStore.getState().room.connection !== 'reconnecting') return;
    showToast('warning', 'Mất kết nối quá lâu, đã rời phòng học.');
    void leavePomodoroRoom();
  }, RECONNECT_GRACE_MS);
}

const KICKED_TEXT: Partial<Record<CallMediaDisconnectReason, string>> = {
  'duplicate-identity': 'Bạn đã vào phòng này từ thiết bị khác.',
  removed: 'Bạn đã được mời ra khỏi phòng học.',
  'room-closed': 'Phòng học đã đóng.',
};

function onDisconnected(reason: CallMediaDisconnectReason): void {
  clearGrace();
  if (reason === 'client') return; // do chính mình ngắt (`teardown`) — không có gì để báo
  const text = KICKED_TEXT[reason];
  if (text) {
    // Bị đá/đóng phòng: chỉ dọn PHÍA MÁY NÀY. ⛔ Không gọi `POST /calls/:id/leave` — với `duplicate-identity` nó sẽ gỡ luôn máy MỚI của cùng tài khoản.
    showToast('info', text);
    void teardownPomodoroSession();
    return;
  }
  usePomodoroStore.getState().patchRoom({ connection: 'disconnected', failed: true });
}

function onMediaEvent(event: CallMediaEvent): void {
  const { patchRoom } = usePomodoroStore.getState();
  switch (event.type) {
    case 'connected':
    case 'reconnected':
      clearGrace();
      patchRoom({ connection: 'connected', failed: false, reconnectingSince: null });
      break;
    case 'reconnecting':
      patchRoom({ connection: 'reconnecting', reconnectingSince: Date.now() });
      armGrace();
      break;
    case 'participants': {
      // Trạng thái mic/camera THẬT của mình lấy từ SDK: máy chủ media thu quyền mic lúc sang FOCUS thì track bị unpublish và UI phản chiếu đúng.
      const local = event.participants.find((p) => p.isLocal);
      patchRoom({
        participants: event.participants,
        ...(local ? { cameraOn: local.cameraEnabled, micOn: local.micEnabled } : {}),
      });
      break;
    }
    case 'disconnected':
      onDisconnected(event.reason);
      break;
  }
}

export async function connectPomodoroSession(join: PomodoroJoinResult, channelId: string): Promise<void> {
  const media = getCallMedia();
  const mine = ++generation;
  unsubscribe?.();
  unsubscribe = media.subscribe(onMediaEvent);
  clearGrace();
  const { patchRoom } = usePomodoroStore.getState();
  patchRoom({ ...EMPTY_ROOM, callId: join.call.id, channelId, connection: 'connecting' });

  let credentials = { token: join.token, url: join.livekitUrl };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (mine !== generation) return; // đã rời/đổi phòng trong lúc chờ
    try {
      await media.connect({ audio: false, token: credentials.token, url: credentials.url, video: false });
      if (mine !== generation) {
        await media.disconnect();
        return;
      }
      await media.setSpeakerOn(true).catch(() => undefined);
      patchRoom({ connection: 'connected', failed: false, speakerOn: true });
      return;
    } catch (error) {
      if (mine !== generation) return;
      if (error instanceof MediaUnavailableError) {
        showToast('error', 'Bản dựng này chưa hỗ trợ âm thanh phòng học (cần bản dev-client).');
        patchRoom({ connection: 'disconnected', failed: true });
        return;
      }
      if (attempt === MAX_ATTEMPTS) break;
      await wait(1000 * attempt);
      // Token có TTL ngắn: lần thử sau xin token mới (`POST /calls/:id/token`); lỗi xin token thì dùng lại token cũ.
      const renewed = await pomodoroService.renewToken(join.call.id).catch(() => null);
      if (renewed) credentials = { token: renewed.token, url: renewed.livekitUrl };
    }
  }
  if (mine === generation) patchRoom({ connection: 'disconnected', failed: true });
}

/** Ngắt media + dọn state PHÍA MÁY NÀY (không báo server). Idempotent. */
export async function teardownPomodoroSession(): Promise<void> {
  generation += 1;
  clearGrace();
  unsubscribe?.();
  unsubscribe = null;
  await getCallMedia().disconnect();
  usePomodoroStore.getState().resetRoom();
}

/** "Rời": ngắt media trước (dừng track ngay) rồi báo server (best-effort — mất mạng thì webhook LiveKit `participant_left` lo). */
export async function leavePomodoroRoom(): Promise<void> {
  const callId = usePomodoroStore.getState().room.callId;
  await teardownPomodoroSession();
  if (callId) await pomodoroService.leave(callId).catch(() => undefined);
}
