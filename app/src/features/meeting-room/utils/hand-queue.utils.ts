import type { RoomPerson } from './room-people.utils';

/**
 * Bàn tay của phòng họp. Bộ icon (xuất từ Figma) CHƯA có hình bàn tay, và luật bộ icon cấm tự vẽ `<Path>`/thêm `.svg` ⇒ dùng emoji:
 * là CHỮ hệ thống (font emoji của máy), ai cũng đọc ra "giơ tay" — Meet/Zoom/Teams đều dùng hình bàn tay cho việc này.
 * ⛔ Trước đây nút và danh sách dùng `circle-arrow-up` (mũi tên lên) — không ai nhận ra đó là "giơ tay".
 */
export const HAND_EMOJI = '✋';

type HandHolder = Pick<RoomPerson, 'handRaisedAt' | 'userId'>;

/**
 * Hàng đợi phát biểu: `userId` → số thứ tự (1 = giơ tay SỚM nhất) theo `handRaisedAt` (ISO giờ server — so chuỗi ISO cùng định dạng
 * chính là so thời điểm). MỘT nguồn cho ô sân khấu ("✋ 2"), danh sách người và viên đếm ở đầu phòng ⇒ ba chỗ không bao giờ lệch số.
 * Trùng giờ (hiếm) ⇒ giữ thứ tự gốc của danh sách (sắp xếp ổn định).
 */
export function raisedHandOrder(people: readonly HandHolder[]): Map<string, number> {
  const raised = people
    .filter((person) => person.handRaisedAt)
    .sort((a, b) => (a.handRaisedAt ?? '').localeCompare(b.handRaisedAt ?? ''));
  return new Map(raised.map((person, index) => [person.userId, index + 1]));
}
