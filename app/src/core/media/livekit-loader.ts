import { Platform } from 'react-native';

import type * as LiveKitNativeSdk from '@livekit/react-native';
import type * as LiveKitSdk from 'livekit-client';

import { MediaUnavailableError } from './call-media.types';

export type LiveKitModule = typeof LiveKitSdk;
export type LiveKitNative = typeof LiveKitNativeSdk;

let cached: [LiveKitModule, LiveKitNative] | null = null;

/**
 * Nạp LƯỜI SDK LiveKit (module NATIVE/WebRTC — không có trong Jest/Expo Go). `registerGlobals()` PHẢI chạy trước khi tạo
 * `Room` (polyfill WebRTC) và idempotent, nên gọi ở đây thay vì bắt gốc app nạp sớm. Thiếu module native ⇒ `MediaUnavailableError`.
 */
export async function loadLiveKit(): Promise<[LiveKitModule, LiveKitNative]> {
  if (cached) return cached;
  try {
    const native = await import('@livekit/react-native');
    native.registerGlobals();
    cached = [await import('livekit-client'), native];
    return cached;
  } catch (error) {
    throw new MediaUnavailableError(error instanceof Error ? error.message : undefined);
  }
}

type AndroidOutput = 'bluetooth' | 'earpiece' | 'headset' | 'speaker';
/** Thứ tự mặc định của LiveKit Android (`AudioSwitchManager`): tai nghe Bluetooth → tai nghe dây → LOA NGOÀI → loa trong. */
const SPEAKER_FIRST: AndroidOutput[] = ['bluetooth', 'headset', 'speaker', 'earpiece'];
const EARPIECE_FIRST: AndroidOutput[] = ['bluetooth', 'headset', 'earpiece', 'speaker'];

/**
 * Phiên âm thanh chế độ "cuộc gọi" (Android `inCommunication` + `voiceCommunication`, iOS `playAndRecord`).
 *
 * `output` = đường ra ƯU TIÊN khi KHÔNG có tai nghe — Android chọn theo danh sách ưu tiên lúc `startAudioSession`, nên tai nghe dây/Bluetooth
 * đang cắm vẫn thắng (khác `selectAudioOutput('speaker')` ép loa ngoài kể cả khi đang đeo tai nghe). Phòng họp truyền `speaker`/`earpiece`.
 * ⚠️ Bỏ trống (cuộc gọi 1-1) = GIỮ hành vi cũ: Android theo thứ tự mặc định của LiveKit (loa NGOÀI trước loa trong), iOS `earpiece`. Vẫn
 * truyền danh sách tường minh vì module native là MỘT thể hiện dùng chung: phòng họp vừa đặt "loa trong trước" thì cuộc gọi sau không thừa hưởng.
 * ⚠️ iOS: `registerGlobals()` bật quản lý phiên âm thanh tự động (`setupIOSAudioManagement`, ưu tiên loa ngoài) — `defaultOutput` ở đây có thể
 * bị chính sách đó ghi đè khi bộ máy âm thanh bật. CHƯA XÁC MINH trên iPhone thật.
 */
export async function startCallAudio(native: LiveKitNative, output?: 'earpiece' | 'speaker'): Promise<void> {
  await native.AudioSession.configureAudio({
    android: {
      audioTypeOptions: native.AndroidAudioTypePresets.communication,
      preferredOutputList: output === 'earpiece' ? EARPIECE_FIRST : SPEAKER_FIRST,
    },
    ios: { defaultOutput: output === 'speaker' ? 'speaker' : 'earpiece' },
  });
  await native.AudioSession.startAudioSession();
}

/** Id đầu ra âm thanh khác nhau theo nền tảng (iOS `default`/`force_speaker`, Android `earpiece`/`speaker`). */
export function speakerOutputId(on: boolean): string {
  if (Platform.OS === 'ios') return on ? 'force_speaker' : 'default';
  return on ? 'speaker' : 'earpiece';
}
