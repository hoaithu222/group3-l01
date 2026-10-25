import type { CallDto, IncomingCallView } from '../api/calls.types';

/**
 * Tên/avatar người CÒN LẠI (không phải mình) trong cuộc gọi — dự phòng khi `scope.title`/`scope.avatarUrl`
 * (đã resolve theo góc nhìn người xem ở BE) rỗng do race lúc tạo/nhận cuộc gọi.
 *
 * ⛔ KHÔNG dùng `source.initiator` làm dự phòng: `initiator` LUÔN LÀ NGƯỜI GỌI bất kể ai đang xem màn hình —
 * dùng nó thì máy của chính người gọi (outgoing) sẽ hiện nhầm tên/avatar của MÌNH thay vì người được gọi.
 * Chỉ áp dụng cho DIRECT (1-1): cuộc gọi nhóm/kênh/họp không có một "người còn lại" duy nhất để thay cho tên nhóm.
 */
export function directPeerFallback(
  source: CallDto | IncomingCallView,
  meId: string | null,
): { avatarUrl: string | null; name: string } | null {
  if (source.scope.kind !== 'DIRECT') return null;
  const peer =
    'participants' in source
      ? source.participants.find((p) => p.userId !== meId)
      : source.participantsPreview.find((p) => p.id !== meId);
  return peer ? { avatarUrl: peer.avatarUrl, name: peer.name } : null;
}
