import type { RoomPerson } from '../../utils/room-people.utils';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Hai `videoRef` (mảnh mờ đục của adapter) có vẽ ra CÙNG một track không — để ô khỏi vẽ lại video khi không có gì đổi.
 *
 * ⚠️ Adapter LiveKit dựng object `videoRef` MỚI ở MỖI snapshot (`refOf` trong `media/livekit-meeting-snapshot.ts`:
 * `{ participant, publication, source }`), mà snapshot bắn theo mỗi lần người nói / chất lượng mạng đổi ⇒ so `===` thì MỌI ô có video
 * vẽ lại liên tục. So NÔNG (cùng bộ khoá, từng giá trị `Object.is`): các giá trị bên trong là object SDK sống lâu (cùng participant,
 * cùng publication) nên "cùng track" vẫn ra bằng nhau — UI không cần hiểu bên trong có gì. Giá trị không phải object (chuỗi trong
 * test, `null`) thì rơi về `Object.is`.
 */
export function sameVideoRef(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]))
  );
}

/**
 * Hai bản `RoomPerson` có vẽ ra CÙNG một ô không — chỉ xét trường ô THẬT SỰ hiển thị.
 *
 * ✅ Chất lượng mạng, `mutedByHost`, `cameraEnabled`, `screenShareRef` KHÔNG hiện trên ô ⇒ sự kiện `ConnectionQualityChanged` (dồn dập)
 * không vẽ lại ô nào. Giờ giơ tay chỉ xét CÓ/KHÔNG — số thứ tự là prop riêng (`handOrder`) do sân khấu tính một lần.
 */
export function samePersonOnTile(a: RoomPerson, b: RoomPerson): boolean {
  return (
    a.userId === b.userId &&
    a.name === b.name &&
    a.isLocal === b.isLocal &&
    a.role === b.role &&
    a.isSpeaking === b.isSpeaking &&
    a.micEnabled === b.micEnabled &&
    Boolean(a.handRaisedAt) === Boolean(b.handRaisedAt) &&
    sameVideoRef(a.videoRef, b.videoRef)
  );
}

/**
 * Bộ so của `memo(ParticipantTile)`: mọi prop so `Object.is`, riêng `person` so theo `samePersonOnTile` (cha dựng `RoomPerson` MỚI ở
 * mỗi snapshot — `mergePeople`). Cùng bộ khoá mới coi là bằng: thêm/bớt một prop luôn vẽ lại (an toàn hơn bỏ sót).
 */
export function sameTileProps<P extends { person: RoomPerson }>(
  prev: Readonly<P>,
  next: Readonly<P>,
): boolean {
  const keys = Object.keys(next) as (keyof P)[];
  if (keys.length !== Object.keys(prev).length) return false;
  return keys.every((key) =>
    key === 'person' ? samePersonOnTile(prev.person, next.person) : Object.is(prev[key], next[key]),
  );
}
