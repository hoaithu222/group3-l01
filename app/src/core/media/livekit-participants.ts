import type { Participant, Room, Track } from 'livekit-client';

import type { CallMediaDisconnectReason, CallMediaParticipant } from './call-media.types';

/**
 * Ánh xạ kiểu của SDK LiveKit sang kiểu của cổng (`call-media.types.ts`) — thuần dữ liệu, tách khỏi adapter để adapter
 * ≤ 150 dòng và để `core/media` là NƠI DUY NHẤT biết hình dạng `Participant`/`DisconnectReason`.
 *
 * ⚠️ CHƯA XÁC MINH trên thiết bị thật (cần dev-client): viết theo `livekit-client@2.22` + `@livekit/react-native@3.0`.
 */

/** Giá trị số của `DisconnectReason` (proto LiveKit) — khai lại thay vì import enum để file này không kéo SDK vào Jest. */
const REASON_CLIENT_INITIATED = 1;
const REASON_DUPLICATE_IDENTITY = 2;
const REASON_PARTICIPANT_REMOVED = 4;
const REASON_ROOM_DELETED = 5;
const REASON_ROOM_CLOSED = 10;

export function reasonOf(reason: number | undefined): CallMediaDisconnectReason {
  switch (reason) {
    case REASON_CLIENT_INITIATED:
      return 'client';
    case REASON_DUPLICATE_IDENTITY:
      return 'duplicate-identity';
    case REASON_PARTICIPANT_REMOVED:
      return 'removed';
    case REASON_ROOM_DELETED:
    case REASON_ROOM_CLOSED:
      return 'room-closed';
    default:
      return 'error';
  }
}

function toParticipant(p: Participant, isLocal: boolean, cameraSource: Track.Source): CallMediaParticipant {
  const publication = p.getTrackPublication(cameraSource);
  const hasVideo = Boolean(publication?.track) && !publication?.isMuted;
  return {
    cameraEnabled: p.isCameraEnabled,
    identity: p.identity,
    isLocal,
    isSpeaking: p.isSpeaking,
    micEnabled: p.isMicrophoneEnabled,
    videoRef: hasVideo ? { participant: p, publication, source: cameraSource } : null,
  };
}

/** Người mình trước, rồi người xa theo thứ tự tham gia — UI chọn ô lớn/ô nhỏ. */
export function snapshotOf(room: Room, cameraSource: Track.Source): CallMediaParticipant[] {
  return [
    toParticipant(room.localParticipant, true, cameraSource),
    ...[...room.remoteParticipants.values()].map((p) => toParticipant(p, false, cameraSource)),
  ];
}
