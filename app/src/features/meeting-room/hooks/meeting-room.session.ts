import { ensureBluetoothAudioPermission } from '@/core/media/bluetooth-permission';
import { MediaUnavailableError } from '@/core/media/call-media.types';

import { CONNECT_MAX_ATTEMPTS } from '../constants/meeting-room.constants';
import { getMeetingMedia } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';
import { createMediaEventHandler, enterRoom, GRACE_MESSAGE } from './meeting-room.media-events';
import { ensureDevice } from './meeting-room.permissions';
import {
  currentGeneration,
  isReconnecting,
  nextGeneration,
  renewTicket,
  setMediaBinding,
  setReconnecting,
  startGrace,
} from './meeting-room.runtime-state';
import { failToPrejoin } from './meeting-room.teardown';

/**
 * Cầu nối store ⇄ `MeetingMediaPort` — KHÔNG phải hook để vòng đời media không dính vào vòng đời màn hình (thu nhỏ/rời màn phòng
 * không được làm rớt âm thanh). Gọi từ `meeting-room.join.ts` khi `JOINED`; ngắt bằng `teardownMeetingSession`.
 *
 * ⚠️ CHƯA XÁC MINH trên thiết bị thật (cần dev-client + LiveKit staging): kết nối/nối lại WebRTC, quyền mic/camera, âm thanh loa ngoài.
 */

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const UNAVAILABLE = 'Bản dựng này chưa hỗ trợ họp trực tuyến (cần bản dev-client).';
const FAILED = 'Không kết nối được phòng họp. Hãy thử lại.';

interface ConnectOptions {
  /** Nối lại sau khi rớt: KHÔNG tự bật lại mic/camera (app.md §7) và giữ pha `RECONNECTING`. */
  resume?: boolean;
}

/**
 * Nối vào phòng LiveKit bằng vé (`ticket`) đã có trong store. Quyền mic/camera chỉ xin lại khi người dùng ĐÃ chọn bật ở pre-join
 * (mặc định tắt — không bao giờ tự bật, kể cả khi được cho vào từ phòng chờ hay được cấp đồng chủ trì).
 */
export async function connectToRoom(options: ConnectOptions = {}): Promise<void> {
  const mine = nextGeneration();
  const media = getMeetingMedia();
  setMediaBinding(media.subscribe(createMediaEventHandler({ reconnect })));

  const { preJoin, publish } = meetingRoomApi.get();
  const canPublish = !options.resume && !preJoin.listenOnly;
  const audio = canPublish && publish.audio && preJoin.mic && (await ensureDevice('mic'));
  const video = canPublish && publish.video && preJoin.cam && (await ensureDevice('cam'));
  // Android 12+: "Thiết bị ở gần" để nghe/nói qua tai nghe Bluetooth — xin TRƯỚC khi phiên âm thanh bật (cả người chỉ nghe); từ chối vẫn vào.
  if (!options.resume) await ensureBluetoothAudioPermission();
  if (mine !== currentGeneration()) return; // đã rời/đổi phòng trong lúc chờ quyền
  meetingRoomApi.patch(options.resume ? { connection: 'reconnecting' } : { camOn: video, connection: 'connecting', micOn: audio, phase: 'CONNECTING' });

  for (let attempt = 1; attempt <= CONNECT_MAX_ATTEMPTS; attempt += 1) {
    const ticket = meetingRoomApi.get().ticket;
    if (!ticket || mine !== currentGeneration()) return;
    try {
      // Loa: chỉ truyền đường ra ƯU TIÊN (tai nghe/Bluetooth đang cắm vẫn thắng). ⛔ Không `setSpeakerOn` sau khi nối như trước — lệnh đó ép
      // loa ngoài kể cả khi người dùng đang đeo tai nghe Bluetooth.
      const speaker = meetingRoomApi.get().speakerOn;
      await media.connect({ audio, facing: preJoin.facing, speaker, token: ticket.token, url: ticket.url, video });
      if (mine !== currentGeneration()) {
        await media.disconnect();
        return;
      }
      enterRoom();
      return;
    } catch (error) {
      if (error instanceof MediaUnavailableError) {
        await failToPrejoin(UNAVAILABLE);
        return;
      }
      if (mine !== currentGeneration()) return;
      if (attempt < CONNECT_MAX_ATTEMPTS) {
        await wait(1000 * attempt);
        // Token có TTL ngắn: lần thử sau xin token mới; lỗi xin token thì dùng lại token cũ.
        await renewTicket();
      }
    }
  }
  if (mine === currentGeneration()) await failToPrejoin(FAILED);
}

/**
 * Rớt hẳn (LiveKit `Disconnected` lý do `error`, không phải mạng chập chờn): xin token mới và dựng lại `Room` trong hạn
 * `RECONNECT_GRACE_MS`. Sau khi nối lại mic/camera đang TẮT — người dùng tự bật lại (app.md §7).
 */
async function reconnect(): Promise<void> {
  if (isReconnecting()) return;
  setReconnecting(true);
  const mine = currentGeneration();
  meetingRoomApi.patch({ camOn: false, connection: 'reconnecting', micOn: false, phase: 'RECONNECTING' });
  startGrace(() => void failToPrejoin(GRACE_MESSAGE));
  await renewTicket();
  // ⛔ Người dùng rời/hết hạn ân hạn trong lúc chờ token (mạng đang chập chờn — có thể vài giây): KHÔNG nối lại. Thiếu chặn này `connectToRoom`
  // mở thế hệ mới và vào lại phòng LiveKit sau khi đã rời — "kết nối ma" vẫn nghe tiếng, người khác vẫn thấy mình trong phòng.
  if (mine === currentGeneration()) await connectToRoom({ resume: true });
  setReconnecting(false);
}
