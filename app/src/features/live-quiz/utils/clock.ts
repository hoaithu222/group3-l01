/**
 * Đồng hồ theo SERVER (app.md p5-01 §4): `offset = serverNow − Date.now()` lúc nhận snapshot. ⛔ Không đếm giờ bằng
 * đồng hồ máy — máy lệch vài giây là người chơi thấy "còn 3 giây" trong khi server đã đóng câu.
 */
export function clockOffset(serverNow: number | undefined): number {
  return typeof serverNow === 'number' ? serverNow - Date.now() : 0;
}

export function remainingMs(deadlineAt: number, offsetMs: number): number {
  return Math.max(0, deadlineAt - (Date.now() + offsetMs));
}

export const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function choiceLabel(index: number): string {
  return CHOICE_LABELS[index] ?? String(index + 1);
}

/** Gắn `clockOffsetMs` vào snapshot NGAY lúc nhận (trong `queryFn`) — đo muộn hơn là cộng thêm độ trễ render. */
export function withClockOffset<T extends { serverNow: number }>(snapshot: T): T & { clockOffsetMs: number } {
  return { ...snapshot, clockOffsetMs: clockOffset(snapshot.serverNow) };
}
