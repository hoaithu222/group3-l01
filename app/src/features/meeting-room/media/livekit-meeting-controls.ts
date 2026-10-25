import { createElement, type ReactNode } from 'react';

import type * as LiveKitSdk from 'livekit-client';

import type { CallVideoStyle } from '@/core/media/call-media.types';
import type { LiveKitModule, LiveKitNative } from '@/core/media/livekit-loader';

import { REACTION_EMOJIS } from '../constants/meeting-room.constants';
import { REACTION_TOPIC } from './livekit-meeting-snapshot';

/**
 * Thao tác thiết bị/cấu hình của adapter LiveKit, tách khỏi `livekit-meeting-media.ts` để mỗi file ≤ 150 dòng. Hàm nhận `room`/`sdk` từ
 * adapter (không giữ state) nên đọc được từng hàm một. Subscribe video theo trang: `livekit-video-subscriptions.ts`.
 *
 * ⚠️ CHƯA XÁC MINH trên thiết bị thật (cần dev-client + LiveKit staging): đổi camera, xem trước, data channel. Cấu hình đã đối chiếu mã
 * nguồn `livekit-client@2.22.3` (`room/defaults.ts`, `participant/publishUtils.ts`) + `@livekit/react-native-webrtc@144` (`RTCUtil.ts`).
 */

export type Facing = 'back' | 'front';

const facingMode = (facing: Facing): 'environment' | 'user' => (facing === 'front' ? 'user' : 'environment');

/** Camera 720p15 trên điện thoại tầm trung (app.md §6 — chốt lại sau MR-15). MỘT nơi cho lúc bật camera VÀ lúc đổi camera. */
const CAMERA_RESOLUTION = { frameRate: 15, height: 720, width: 1280 } as const;

/** ⛔ Luôn kèm độ phân giải + khung hình: thiếu là `react-native-webrtc` mở camera ở mặc định của nó 1280×720 @30 fps (gấp đôi tải mã hoá). */
const cameraCapture = (facing: Facing): LiveKitSdk.VideoCaptureOptions => ({ facingMode: facingMode(facing), resolution: { ...CAMERA_RESOLUTION } });

/**
 * Tuỳ chọn `Room` (app.md §6):
 *  · `adaptiveStream` — chất lượng video NHẬN theo kích thước ô đang vẽ (`VideoTrack` báo `onLayout`); không ô nào vẽ/app ra nền ⇒ SFU tạm ngừng gửi.
 *  · `dynacast` — lớp simulcast không ai xem thì máy mình ngừng mã hoá lớp đó (đỡ CPU/pin/băng thông lên).
 *  · Camera simulcast 3 lớp h180/h360/h720 @15 fps. Lớp cao nhất 1,2 Mbps: preset h720 của SDK (1,7 Mbps, 30 fps) tính cho 30 fps — để mặc định
 *    thì bộ mã hoá được phép đẩy 1,7 Mbps cho 15 khung/giây, phí lưu lượng 4G mà không nét hơn. `maxFramerate` = khung hình chụp ⇒ mọi lớp ≤ 15 fps.
 *  · Âm thanh `speech` (24 kbps — mặc định SDK là `music` 48 kbps) + DTX (im lặng thì không gửi) + RED (gửi kèm gói dự phòng, chịu mất gói
 *    tốt trên 4G): họp là giọng nói, nhân với số người nhận nên nhẹ đi một nửa là đáng kể.
 *  · VP8: Android luôn có bộ mã hoá phần mềm (libvpx); H.264 phụ thuộc chip và simulcast H.264 phần cứng hay lỗi — giữ như cuộc gọi 1-1.
 * Còn lại theo mặc định SDK: `stopLocalTrackOnUnpublish: true` (gỡ track là tắt đèn camera), chính sách nối lại mặc định (~10 lần, giãn tới 7 s —
 * hạn `RECONNECT_GRACE_MS` 30 s của phòng cắt trước), không E2EE, `degradationPreference` camera = giữ khung hình; `disconnectOnPageLeave` chỉ
 * có nghĩa trên web. Thu âm: SDK mặc định bật `echoCancellation`/`noiseSuppression`/`autoGainControl`. Chia sẻ màn hình: mặc định SDK (h1080 @15).
 */
export function roomOptionsFor(sdk: LiveKitModule, facing: Facing): LiveKitSdk.RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      audioPreset: sdk.AudioPresets.speech,
      dtx: true,
      red: true,
      simulcast: true,
      videoCodec: 'vp8',
      videoEncoding: { maxBitrate: 1_200_000, maxFramerate: CAMERA_RESOLUTION.frameRate },
      videoSimulcastLayers: [sdk.VideoPresets.h180, sdk.VideoPresets.h360],
    },
    videoCaptureDefaults: cameraCapture(facing),
  };
}

/**
 * Đổi camera trước/sau trong phòng.
 *  · Đổi luôn `videoCaptureDefaults` của phòng (SDK tự làm y hệt ở `switchActiveDevice`): chưa có track camera thì lần BẬT sau mở đúng mặt mới.
 *  · ⛔ Camera đang TẮT (track bị mute) thì KHÔNG `restartTrack` — hàm đó mở lại phần cứng camera dù track đang tắt (đèn camera sáng ngầm, lại
 *    còn giữ mặt cũ cho lần bật sau). Gỡ track đã tắt (người khác vốn đã thấy camera tắt) để lần bật sau tạo track mới đúng mặt vừa chọn.
 *  · Đang bật: `restartTrack` với ĐỦ độ phân giải/khung hình (`cameraCapture`) — bản cũ chỉ truyền `facingMode` nên sau khi đổi camera máy chạy 30 fps.
 */
export async function restartCameraFacing(room: LiveKitSdk.Room, sdk: LiveKitModule, facing: Facing): Promise<void> {
  const capture = cameraCapture(facing);
  room.options.videoCaptureDefaults = { ...room.options.videoCaptureDefaults, ...capture };
  const track = room.localParticipant.getTrackPublication(sdk.Track.Source.Camera)?.videoTrack;
  if (!track) return;
  if (track.isMuted) await room.localParticipant.unpublishTrack(track, true);
  else await track.restartTrack(capture);
}

/**
 * Cảm xúc qua data channel — chỉ gửi emoji trong danh sách cho phép. `reliable: false`: cảm xúc là tức thời, mất gói không sao
 * (không lưu, không phát lại).
 */
export async function publishReaction(room: LiveKitSdk.Room, emoji: string): Promise<void> {
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return;
  const data = new TextEncoder().encode(JSON.stringify({ at: Date.now(), emoji }));
  await room.localParticipant.publishData(data, { reliable: false, topic: REACTION_TOPIC });
}

/** Track camera CỤC BỘ cho xem trước ở pre-join (chưa kết nối phòng) + mảnh mờ đục cho `renderVideo`. */
export async function createPreview(sdk: LiveKitModule, facing: Facing): Promise<{ ref: unknown; track: LiveKitSdk.LocalVideoTrack }> {
  const track = await sdk.createLocalVideoTrack({ facingMode: facingMode(facing) });
  return { ref: { publication: { track, trackSid: 'preview' }, source: sdk.Track.Source.Camera }, track };
}

/** ⛔ PHỦ TUYỆT ĐỐI khung cha, không `flex: 1`: `VideoTrack` không có kích thước nội tại — cha `items-center` co bề rộng về 0 (màn đen, không lỗi). */
const FILL = { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as const;

/**
 * Phần tử `VideoTrack` cho một mảnh video. `adaptiveStream` đọc kích thước THẬT của khung (onLayout) nên ô nhỏ tự xin lớp simulcast thấp, ô
 * lớn/màn chia sẻ xin lớp cao — không cần đặt chất lượng tay theo ô. `zOrder: 1` cho ô nổi đè lên video khác (Android `SurfaceView`).
 */
export function videoElement(native: LiveKitNative | null, videoRef: unknown, style: CallVideoStyle): ReactNode {
  const VideoTrack = native?.VideoTrack;
  if (!VideoTrack || !videoRef) return null;
  const { mirror, objectFit = 'cover', zOrder } = style;
  return createElement(VideoTrack, { mirror, objectFit, style: FILL, trackRef: videoRef as never, zOrder });
}
