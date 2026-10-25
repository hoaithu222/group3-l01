import { ROLE_LABEL } from '../../constants/meeting-room.constants';
import type { RoomPerson } from '../../utils/room-people.utils';

/**
 * Nhãn CHỮ của một ô người — luật của phòng họp (app.md §7): mọi trạng thái (đang nói, tắt mic, giơ tay, ghim) phải có CHỮ, không chỉ
 * viền/màu/icon. Danh sách này là nguồn của `accessibilityLabel` (trình đọc màn hình nghe ĐỦ mọi trạng thái, kể cả ở ô nhỏ); phần nhìn
 * thấy trên ô do `TileFooter` (tên + chip "Đang nói"/"Đã tắt mic") và `TileHandBadge` (✋ + số thứ tự) vẽ.
 *
 * `handOrder` = thứ tự trong hàng đợi phát biểu (`raisedHandOrder`, 1 = giơ sớm nhất) ⇒ "Đang giơ tay thứ 2". Thiếu thì chỉ "Đang giơ tay".
 */
export function personStatuses(person: RoomPerson, pinned: boolean, handOrder?: number): string[] {
  return [
    person.isSpeaking ? 'Đang nói' : '',
    person.handRaisedAt ? (handOrder ? `Đang giơ tay thứ ${handOrder}` : 'Đang giơ tay') : '',
    person.micEnabled ? '' : 'Đã tắt mic',
    pinned ? 'Đã ghim' : '',
  ].filter(Boolean);
}

/** Tên hiện trên ô: người MÌNH luôn có "(Bạn)" để không lẫn với người trùng tên. */
export function personDisplayName(person: RoomPerson): string {
  return person.isLocal ? `${person.name} (Bạn)` : person.name;
}

/** Câu trình đọc màn hình nói khi chạm vào ô: "Lan, Chủ trì, Đang nói, Đang giơ tay thứ 1, Đã tắt mic". */
export function tileAccessibilityLabel(person: RoomPerson, pinned: boolean, handOrder?: number): string {
  return [personDisplayName(person), ROLE_LABEL[person.role], ...personStatuses(person, pinned, handOrder)].filter(Boolean).join(', ');
}
