/**
 * Tính `afterTaskId`/`beforeTaskId` gửi lên `POST /tasks/:id/move` — dùng CHUNG
 * cho kéo thả (`drop-target.ts`) và `MoveTaskSheet`, để hai đường vào cho ra
 * cùng một kết quả.
 */
export interface Neighbors {
  /** Thẻ liền TRƯỚC vị trí mới; `null` = đầu cột. */
  afterTaskId: string | null;
  /** Thẻ liền SAU vị trí mới; `null` = cuối cột. */
  beforeTaskId: string | null;
}

/**
 * `columnIds` = thứ tự thẻ HIỆN TẠI của cột đích (nếu thẻ đang di chuyển nằm
 * trong cột đó thì nó cũng có mặt). `index` = vị trí mong muốn TRONG danh sách
 * SAU KHI đã bỏ thẻ đang di chuyển — tức "chèn vào khe số `index`".
 *
 * ⚠️ Phải bỏ thẻ đang di chuyển TRƯỚC khi đếm: server cũng loại nó khỏi hàng xóm
 * (be.md §5 Move bước 3), nên nếu ta đếm cả nó thì thẻ "xuống 1" sẽ nhận chính
 * mình làm hàng xóm và bị 400.
 */
export function neighborsAt(
  columnIds: readonly string[],
  movingId: string,
  index: number,
): Neighbors {
  const others = columnIds.filter((id) => id !== movingId);
  const slot = Math.max(0, Math.min(index, others.length));
  // Thẻ TẠM (`tmp_…`, đang chờ server tạo) không làm mốc được: BE chỉ nhận ObjectId (`moveTaskSchema`) ⇒ gửi nó là `400` và thẻ
  // bật về chỗ cũ. Lấy thẻ THẬT gần nhất cùng phía — thẻ tạm luôn chèn ở CUỐI cột nên "sau thẻ tạm" ≡ "sau thẻ thật cuối cùng".
  const afterTaskId = others.slice(0, slot).reverse().find((id) => !isTempTaskId(id)) ?? null;
  const beforeTaskId = others.slice(slot).find((id) => !isTempTaskId(id)) ?? null;
  return { afterTaskId, beforeTaskId };
}

/** Id tạm của thẻ vừa tạo nhanh, chưa có id server (`tempTaskId` ở `tasks.queries.ts`). */
function isTempTaskId(id: string): boolean {
  return id.startsWith('tmp_');
}

export type MoveShortcut = 'bottom' | 'down' | 'top' | 'up';

/**
 * Khe đích cho bốn lối tắt của `MoveTaskSheet` trong CÙNG cột. Trả `null` khi
 * lối tắt vô nghĩa (đã ở đầu/cuối) — sheet ẩn/khoá hành động đó.
 *
 * `index` tính trên danh sách ĐÃ bỏ thẻ (xem `neighborsAt`): thẻ đang ở vị trí
 * `i` thì "lên 1" là khe `i - 1`, "xuống 1" là khe `i + 1`.
 */
export function shortcutSlot(
  columnIds: readonly string[],
  movingId: string,
  shortcut: MoveShortcut,
): number | null {
  const current = columnIds.indexOf(movingId);
  if (current < 0) return null;
  const last = columnIds.length - 1;
  switch (shortcut) {
    case 'top':
      return current === 0 ? null : 0;
    case 'up':
      return current === 0 ? null : current - 1;
    case 'down':
      return current === last ? null : current + 1;
    case 'bottom':
      return current === last ? null : last;
  }
}
