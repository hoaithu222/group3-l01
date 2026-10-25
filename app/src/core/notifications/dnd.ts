/** Các mức "Không làm phiền" người dùng chọn nhanh (p0-06 `app.md` §3). "Tuỳ chỉnh" chưa có — xem `app.md` "Điểm lệch". */
export type DndDuration = 'one-hour' | 'eight-hours' | 'until-morning';

/** Giờ "sáng mai" hết Không làm phiền, theo giờ máy. */
export const DND_MORNING_HOUR = 7;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Mốc hết Không làm phiền, dạng ISO UTC (`toISOString`) — BE `z.string().datetime()` chỉ nhận hậu tố `Z`.
 * Hàm thuần: `now` truyền vào để test cố định.
 *
 * `until-morning` là 07:00 giờ MÁY của ngày KẾ TIẾP (kể cả khi bấm lúc 02:00 sáng — "tới sáng mai" của
 * người đang thức khuya là buổi sáng sau đó, không phải 5 tiếng nữa). Dùng `setDate(+1)` để đúng cả
 * ngày chuyển giờ mùa hè.
 */
export function computeDndUntil(duration: DndDuration, now: Date): string {
  if (duration === 'one-hour') return new Date(now.getTime() + HOUR_MS).toISOString();
  if (duration === 'eight-hours') return new Date(now.getTime() + 8 * HOUR_MS).toISOString();

  const morning = new Date(now);
  morning.setDate(morning.getDate() + 1);
  morning.setHours(DND_MORNING_HOUR, 0, 0, 0);
  return morning.toISOString();
}
