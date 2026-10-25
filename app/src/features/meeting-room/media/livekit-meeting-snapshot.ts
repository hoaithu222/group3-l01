import type * as LiveKitSdk from 'livekit-client';

import type { ConnectionQuality, MeetingMediaParticipant } from './meeting-media.types';

/**
 * Ánh xạ kiểu của SDK LiveKit sang `MeetingMediaParticipant` — thuần dữ liệu, tách khỏi adapter để adapter ≤ 150 dòng và để MỘT nơi biết
 * hình dạng `Participant`/`TrackPublication` của cuộc họp. `identity = userId` (BE cấp token từ phiên server).
 *
 * ⚠️ CHƯA XÁC MINH trên thiết bị thật: viết theo `livekit-client@2.22` + `@livekit/react-native@3.0`.
 */

/** Attribute BE/app thống nhất cho giơ tay: ISO thời điểm giơ; chuỗi rỗng = đã hạ (BE `lowerAllHands` xoá bằng `''`). */
export const HAND_ATTRIBUTE = 'handRaisedAt';
export const REACTION_TOPIC = 'meeting.reaction';

const QUALITIES: readonly ConnectionQuality[] = ['excellent', 'good', 'poor', 'lost'];

function qualityOf(value: string | undefined): ConnectionQuality {
  return QUALITIES.find((q) => q === value) ?? 'unknown';
}

function refOf(p: LiveKitSdk.Participant, source: LiveKitSdk.Track.Source): unknown {
  const publication = p.getTrackPublication(source);
  // Có track VÀ chưa bị tắt tiếng/camera thì mới có gì để vẽ; ngược lại UI hiện avatar.
  return publication?.track && !publication.isMuted ? { participant: p, publication, source } : null;
}

function toParticipant(p: LiveKitSdk.Participant, isLocal: boolean, sdk: typeof LiveKitSdk): MeetingMediaParticipant {
  return {
    cameraEnabled: p.isCameraEnabled,
    connectionQuality: qualityOf(p.connectionQuality),
    handRaisedAt: p.attributes[HAND_ATTRIBUTE] ? p.attributes[HAND_ATTRIBUTE] : null,
    identity: p.identity,
    isLocal,
    isSpeaking: p.isSpeaking,
    micEnabled: p.isMicrophoneEnabled,
    name: p.name && p.name.length > 0 ? p.name : p.identity,
    screenShareRef: refOf(p, sdk.Track.Source.ScreenShare),
    videoRef: refOf(p, sdk.Track.Source.Camera),
  };
}

/** Người mình trước, rồi người xa theo thứ tự tham gia — UI tự sắp lại theo `participant-sort.utils`. */
export function snapshotOf(room: LiveKitSdk.Room, sdk: typeof LiveKitSdk): MeetingMediaParticipant[] {
  return [
    toParticipant(room.localParticipant, true, sdk),
    ...[...room.remoteParticipants.values()].map((p) => toParticipant(p, false, sdk)),
  ];
}

/** Cảm xúc nhận qua data channel — chỉ nhận emoji nằm trong danh sách cho phép (không hiện chuỗi lạ từ client khác). */
export function parseReaction(payload: Uint8Array, allowed: readonly string[]): string | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as { emoji?: unknown };
    return typeof parsed.emoji === 'string' && allowed.includes(parsed.emoji) ? parsed.emoji : null;
  } catch {
    return null;
  }
}
