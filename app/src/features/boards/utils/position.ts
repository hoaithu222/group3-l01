import { generateKeyBetween } from 'fractional-indexing';

/**
 * Khoá TẠM cho optimistic update (app.md §4 "Kéo thả" bước 3) — cùng thư viện,
 * cùng phiên bản (`fractional-indexing` 3.2.0) với BE để hai phía đọc chung một
 * thứ tự.
 *
 * ⛔ Server mới là nơi QUYẾT ĐỊNH khoá thật (README §2 "Ai tính vị trí"): client
 * chỉ gửi `afterTaskId`/`beforeTaskId`, khoá ở đây bị thay bằng `position` trả
 * về ở `POST /tasks/:id/move`. Đừng bao giờ gửi khoá này lên server.
 *
 * `null` = không có hàng xóm phía đó (đầu / cuối cột).
 *
 * Thư viện ném lỗi khi `a >= b` — xảy ra khi cache đã cũ so với thứ tự thật
 * (vd sự kiện realtime vừa đảo hai thẻ). Ta không muốn kéo thả ném lỗi giữa
 * chừng nên lùi về khoá "sau `a`", và server sẽ chỉnh lại khi trả kết quả.
 */
export function tempKeyBetween(after: string | null, before: string | null): string {
  const attempts: [string | null, string | null][] = [
    [after, before],
    [after, null],
    [null, null],
  ];
  for (const [low, high] of attempts) {
    try {
      return generateKeyBetween(low, high);
    } catch {
      // Thử phương án lùi kế tiếp — xem chú thích ở trên.
    }
  }
  return generateKeyBetween(null, null);
}
