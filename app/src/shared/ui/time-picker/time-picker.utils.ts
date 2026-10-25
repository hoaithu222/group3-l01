/**
 * Hàm thuần của `TimePicker`. Giá trị là chuỗi `HH:mm` 24 giờ (không phải `Date`): chọn giờ độc lập với NGÀY — form ghép nó
 * với ngày ở nơi gọi (múi giờ do nơi gọi quyết), tránh `TimePicker` mang theo một ngày giả rồi lệch qua nửa đêm/DST.
 */

export interface ClockTime {
  hours: number;
  minutes: number;
}

const PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** `"09:05"` → `{ hours: 9, minutes: 5 }`; sai định dạng/giờ ngoài 0–23 → `null`. */
export function parseTime(value: string | null | undefined): ClockTime | null {
  const match = value ? PATTERN.exec(value.trim()) : null;
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null;
}

export function formatClockTime({ hours, minutes }: ClockTime): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** `[0..23]`. */
export const HOUR_OPTIONS: readonly number[] = Array.from({ length: 24 }, (_, i) => i);

/** Các mốc phút theo bước (mặc định 5): `[0,5,…,55]`. Bước không ước của 60 → về 5 (tránh mốc lẻ không đủ vòng). */
export function minuteOptions(step: number): number[] {
  const safe = step >= 1 && step <= 30 && 60 % step === 0 ? step : 5;
  return Array.from({ length: 60 / safe }, (_, i) => i * safe);
}

/** Làm tròn phút của giá trị đang có về mốc gần nhất ≤ nó để cột phút luôn có dòng được chọn (vd `09:07` bước 5 → `09:05`). */
export function snapMinutes(minutes: number, options: readonly number[]): number {
  let picked = options[0] ?? 0;
  for (const option of options) if (option <= minutes) picked = option;
  return picked;
}
