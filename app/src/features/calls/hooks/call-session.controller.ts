import { getCallMedia } from '@/core/media/call-media.registry';
import { MediaUnavailableError, type CallMediaEvent } from '@/core/media/call-media.types';
import { ensureCameraPermission, ensureMicrophonePermission } from '@/core/media/permissions';
import { showToast } from '@/shared/utils/toast.utils';

import { callsService } from '../api/calls.service';
import type { CallMediaKind, CallToken } from '../api/calls.types';
import { useCallMediaStore } from '../store/call-media.store';
import { callStoreApi } from '../store/call.store';
import type { VoiceJoinPrefs } from '../voice-room/store/voice-join.prefs';
import { useVoiceRoomStore } from '../voice-room/store/voice-room.store';

/**
 * Cầu nối `callStore` ⇄ `CallMediaPort` — KHÔNG phải hook để vòng đời media không dính vào vòng đời màn hình
 * (thu nhỏ/rời màn cuộc gọi không được làm rớt âm thanh). `useCallSession` chỉ gọi `connectCallSession`/`teardownCallSession`
 * theo pha của cuộc gọi.
 */

const MAX_ATTEMPTS = 3;
let unsubscribe: (() => void) | null = null;
let generation = 0;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function onMediaEvent(event: CallMediaEvent): void {
  const media = useCallMediaStore.getState();
  switch (event.type) {
    case 'connected':
    case 'reconnected':
      media.patch({ connection: 'connected' });
      break;
    case 'reconnecting':
      media.patch({ connection: 'reconnecting' });
      break;
    case 'participants':
      media.patch({ participants: event.participants });
      watchRemoteLeft(event.participants.filter((p) => !p.isLocal).length);
      break;
    case 'disconnected':
      media.patch({ connection: 'disconnected' });
      if (event.reason === 'duplicate-identity') {
        // Cùng tài khoản vào từ máy khác (`force`): máy này bị ngắt — nói rõ "đã chuyển", không phải lỗi mạng.
        callStoreApi.dispatch({ reason: 'MOVED_DEVICE', type: 'LOCAL_ENDED' });
      } else if (event.reason === 'removed') {
        callStoreApi.dispatch({ reason: 'REVOKED', type: 'LOCAL_ENDED' });
      } else if (event.reason !== 'client') {
        void resyncAfterDrop();
      }
      break;
  }
}

const REMOTE_LEFT_CHECK_DELAYS_MS = [0, 1000, 3000];
let sawRemote = false;

/**
 * Người kia rời phòng media (bấm kết thúc) là tín hiệu NHANH NHẤT mà máy này có — `call:ended` còn phải đi vòng BE (outbox → worker → socket)
 * nên có thể tới trễ. Từ đây hỏi BE cuộc gọi còn không (vài lần, phòng lúc BE chưa kịp đóng): hết ⇒ `SYNC` kết thúc ngay;
 * còn (nhóm vẫn có người khác / người kia chỉ rớt mạng) ⇒ giữ nguyên, để `call:ended`/reconnect lo.
 */
function watchRemoteLeft(remoteCount: number): void {
  if (remoteCount > 0) {
    sawRemote = true;
    return;
  }
  if (!sawRemote) return;
  sawRemote = false;
  const mine = generation;
  for (const delay of REMOTE_LEFT_CHECK_DELAYS_MS) {
    setTimeout(() => {
      if (mine !== generation) return;
      void callsService
        .getMyActive()
        .then((result) => {
          if (mine === generation) callStoreApi.dispatch({ call: result.call, type: 'SYNC' });
        })
        .catch(() => undefined);
    }, delay);
  }
}

/** Mất kết nối không do mình: hỏi BE cuộc gọi còn không — hết thì kết thúc, còn thì báo hỏng kết nối (không tự nối vô hạn). */
async function resyncAfterDrop(): Promise<void> {
  try {
    const mine = await callsService.getMyActive();
    callStoreApi.dispatch({ call: mine.call, type: 'SYNC' });
    if (mine.call) callStoreApi.dispatch({ type: 'MEDIA_FAILED' });
  } catch {
    callStoreApi.dispatch({ type: 'MEDIA_FAILED' });
  }
}

/**
 * `room` chỉ có với phòng thoại kênh (p2-03): người dùng chọn "Tham gia để nghe" (KHÔNG xin quyền mic — chỉ xin khi họ bấm bật
 * mic) và có bật camera hay không; phòng nhiều người mặc định loa ngoài.
 */
export async function connectCallSession(
  callId: string,
  first: CallToken,
  mediaKind: CallMediaKind,
  room?: VoiceJoinPrefs,
): Promise<void> {
  const media = getCallMedia();
  const mine = ++generation;
  sawRemote = false;
  unsubscribe?.();
  unsubscribe = media.subscribe(onMediaEvent);

  // Quyền xin SAU khi người dùng đã bấm gọi/trả lời (VC-01); từ chối ⇒ vẫn vào, chỉ nghe (không chặn cuộc gọi).
  const wantMic = !room?.listenOnly;
  const mic = wantMic && (await ensureMicrophonePermission()) === 'granted';
  const wantCamera = room ? room.camera : mediaKind === 'VIDEO';
  const camera = wantCamera && (await ensureCameraPermission()) === 'granted';
  useCallMediaStore.getState().patch({ connection: 'connecting', micDenied: wantMic && !mic });

  let token = first;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (mine !== generation) return; // đã kết thúc/đổi cuộc gọi trong lúc chờ
    try {
      await media.connect({ audio: mic, token: token.token, url: token.livekitUrl, video: camera });
      if (mine !== generation) {
        await media.disconnect();
        return;
      }
      useCallMediaStore.getState().patch({ cameraOn: camera, connection: 'connected', micOn: mic });
      if (room) {
        await media.setSpeakerOn(true).catch(() => undefined);
        useCallMediaStore.getState().patch({ speakerOn: true });
      }
      callStoreApi.dispatch({ type: 'MEDIA_CONNECTED' });
      return;
    } catch (error) {
      if (error instanceof MediaUnavailableError) {
        showToast('error', 'Bản dựng này chưa hỗ trợ cuộc gọi âm thanh/video (cần bản dev-client).');
        callStoreApi.dispatch({ type: 'MEDIA_FAILED' });
        return;
      }
      if (attempt === MAX_ATTEMPTS) break;
      await wait(1000 * attempt);
      // Token có TTL ngắn: lần thử sau xin token mới (`POST /calls/:id/token`); lỗi xin token thì dùng lại token cũ.
      token = await callsService.renewToken(callId).catch(() => token);
      callStoreApi.dispatch({ token, type: 'TOKEN_RENEWED' });
    }
  }
  callStoreApi.dispatch({ type: 'MEDIA_FAILED' });
}

export async function teardownCallSession(): Promise<void> {
  generation += 1;
  sawRemote = false;
  unsubscribe?.();
  unsubscribe = null;
  await getCallMedia().disconnect();
  useCallMediaStore.getState().reset();
  useVoiceRoomStore.getState().reset();
}
