import type {
  CallEndedPayload,
  CallParticipantPublicPayload,
  CallParticipantUpdatedPayload,
} from '../../api/calls.socket.types';
import type { VoicePreview, VoicePreviewParticipant } from '../api/voice-room.types';

/** Phân biệt bản CÔNG KHAI (room `ch:{id}`, không có `role`) với bản đầy đủ của phiên mình đang ở (room `call:{id}`). */
export function isPublicParticipantPayload(
  payload: CallParticipantPublicPayload | CallParticipantUpdatedPayload,
): payload is CallParticipantPublicPayload {
  return !('role' in payload.participant);
}

/**
 * Vá bản preview theo socket (room `ch:{id}`, bản công khai của `call:participant-updated`). Hàm THUẦN để test không cần socket.
 * Trả `null` khi KHÔNG vá được từ payload (chưa có phiên trong cache, hoặc phiên khác) — nơi gọi làm mới từ server thay vì đoán.
 *
 * ⚠️ `version` của sự kiện là `Call.version` (chỉ đổi khi chủ phòng thao tác/đổi chủ), KHÔNG tăng khi có người vào/ra — nên nó chỉ
 * bỏ được sự kiện của trước một lần đổi chủ. Thứ tự vào/ra được chốt bằng lần làm mới có trễ ngay sau khi vá.
 */
export function applyParticipantUpdate(preview: VoicePreview, p: CallParticipantPublicPayload): VoicePreview | null {
  if (!preview.call || preview.call.id !== p.callId) return null;
  if (p.version < preview.call.version) return preview;

  const { participant } = p;
  const visible = participant.state === 'CONNECTED' || participant.state === 'RECONNECTING';
  const entry: VoicePreviewParticipant = {
    avatarUrl: participant.avatarUrl,
    cameraEnabled: participant.cameraEnabled,
    handRaisedAt: participant.handRaisedAt,
    isHost: participant.isHost,
    micEnabled: participant.micEnabled,
    name: participant.name,
    sharingScreen: participant.sharingScreen,
    userId: participant.userId,
  };
  const exists = preview.participants.some((x) => x.userId === participant.userId);
  // Vá TẠI CHỖ (giơ tay, chặn mic… không được đẩy người đó xuống cuối danh sách); người mới nối đuôi (họ vào sau cùng).
  let participants = preview.participants.filter((x) => visible || x.userId !== participant.userId);
  participants = exists && visible ? participants.map((x) => (x.userId === participant.userId ? entry : x)) : visible ? [...participants, entry] : participants;
  // Chỉ có MỘT chủ phòng: người vừa được báo là chủ phòng thì mọi người khác hết là chủ phòng (chủ cũ không được báo riêng).
  if (participant.isHost) participants = participants.map((x) => (x.userId === participant.userId ? x : { ...x, isHost: false }));

  const shown = Math.max(p.count, participants.length);
  return {
    ...preview,
    call: { ...preview.call, hostId: participant.isHost ? participant.userId : preview.call.hostId, version: Math.max(preview.call.version, p.version) },
    participants,
    seatsLeft: Math.max(0, preview.limits.maxParticipants - shown),
  };
}

/** `call:ended` của phòng đang xem → phòng trống, đủ chỗ. Phiên khác/không có trong cache → giữ nguyên. */
export function applyCallEnded(preview: VoicePreview, p: CallEndedPayload): VoicePreview {
  if (!preview.call || preview.call.id !== p.callId) return preview;
  return { ...preview, call: null, participants: [], seatsLeft: preview.limits.maxParticipants };
}
