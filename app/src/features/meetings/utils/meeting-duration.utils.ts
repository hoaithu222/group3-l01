/** Số học giờ đồng hồ tường `HH:mm` cho thời lượng nhanh ở form (cùng ngày, không qua nửa đêm). */

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(time: string): number | null {
  const match = TIME.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Số phút từ `start` tới `end` (cùng ngày). `null` khi một trong hai sai định dạng. Âm khi `end` sớm hơn `start`. */
export function minutesBetween(start: string, end: string): number | null {
  const a = toMinutes(start);
  const b = toMinutes(end);
  return a === null || b === null ? null : b - a;
}

/** `start + minutes` dạng `HH:mm`; `null` khi sai định dạng HOẶC vượt 23:59 (form không cho họp qua nửa đêm). */
export function addMinutesToTime(start: string, minutes: number): string | null {
  const base = toMinutes(start);
  if (base === null) return null;
  const total = base + minutes;
  if (total < 0 || total > 23 * 60 + 59) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
