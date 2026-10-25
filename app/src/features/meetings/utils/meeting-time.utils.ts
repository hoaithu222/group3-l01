import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { deviceTimeZone as readDeviceTimeZone, toZoned } from '@/shared/utils/datetime';

import type { MeetingListItemDto } from '../api/meetings.types';
import { TIMEZONE_SHORT } from '../constants/meetings.constants';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Múi giờ mặc định khi Hermes không trả IANA (README p2-04 §6): giờ Việt Nam. */
export const FALLBACK_TIMEZONE = 'Asia/Ho_Chi_Minh';

const WEEKDAYS = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
] as const;

/** Múi giờ IANA của THIẾT BỊ; không đọc được ⇒ giờ Việt Nam. */
export function deviceTimeZone(): string {
  return readDeviceTimeZone() ?? FALLBACK_TIMEZONE;
}

/** Tz IANA có dùng được không (ném lỗi `RangeError` nếu lạ) — dùng để không vỡ khi BE trả tz lạ. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Giờ ĐỒNG HỒ TƯỜNG (`YYYY-MM-DD` + `HH:mm`) trong múi giờ `tz` → ISO UTC. Tính qua dayjs-timezone (xử lý DST). Trả `null` khi sai định
 * dạng. Đây là chỗ DUY NHẤT đổi giờ nhập → mốc tuyệt đối gửi BE; đặt tz sai ở đây là cuộc họp lệch giờ cho MỌI người.
 */
export function zonedTimeToIso(dayKey: string, time: string, tz: string): string | null {
  const zone = isValidTimeZone(tz) ? tz : FALLBACK_TIMEZONE;
  const parsed = dayjs.tz(`${dayKey} ${time}`, 'YYYY-MM-DD HH:mm', zone);
  return parsed.isValid() ? parsed.toDate().toISOString() : null;
}

/** Mốc UTC → `YYYY-MM-DD` + `HH:mm` theo múi giờ `tz` (đổi ngược `zonedTimeToIso`, dùng khi mở form sửa). Rỗng khi mốc hỏng. */
export function isoToZoned(iso: string, tz: string): { dayKey: string; time: string } {
  const at = toZoned(iso, isValidTimeZone(tz) ? tz : FALLBACK_TIMEZONE);
  if (!at) return { dayKey: '', time: '' };
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    dayKey: `${String(at.year)}-${pad(at.month)}-${pad(at.day)}`,
    time: `${pad(at.hour)}:${pad(at.minute)}`,
  };
}

/** Ngày (theo giờ MÁY) → `YYYY-MM-DD`. */
export function toDayKey(date: Date): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/** `YYYY-MM-DD` → `Date` lúc 00:00 giờ máy (để đưa vào `DatePicker`). */
export function fromDayKey(dayKey: string): Date {
  return dayjs(dayKey, 'YYYY-MM-DD').toDate();
}

/** "09:00 – 10:30" theo giờ THIẾT BỊ (README §7: giờ hiển thị theo thiết bị). */
export function formatTimeRange(startAt: string, endAt: string): string {
  return `${dayjs(startAt).format('HH:mm')} – ${dayjs(endAt).format('HH:mm')}`;
}

/** "Thứ ba, 22/09/2026". */
export function formatDayLong(iso: string | Date): string {
  const d = dayjs(iso);
  return `${WEEKDAYS[d.day()] ?? ''}, ${d.format('DD/MM/YYYY')}`;
}

/** Nhãn đầu nhóm ngày: "Hôm nay · Thứ ba, 22/09" · "Ngày mai · …" · "Thứ tư, 23/09". */
export function dayHeading(dayKey: string, now: Date = new Date()): string {
  const d = dayjs(dayKey, 'YYYY-MM-DD');
  const base = `${WEEKDAYS[d.day()] ?? ''}, ${d.format('DD/MM')}`;
  const diff = d.startOf('day').diff(dayjs(now).startOf('day'), 'day');
  if (diff === 0) return `Hôm nay · ${base}`;
  if (diff === 1) return `Ngày mai · ${base}`;
  if (diff === -1) return `Hôm qua · ${base}`;
  return base;
}

/** Tên ngắn của múi giờ: bảng `TIMEZONE_SHORT`, không có thì phần cuối mã IANA (`Africa/Cairo` → "Cairo"). */
export function zoneShortName(tz: string): string {
  return TIMEZONE_SHORT[tz] ?? (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}

/**
 * Nhãn múi giờ CỦA CUỘC HỌP khi khác giờ thiết bị: "09:00 giờ Hà Nội" (MT-19); rỗng khi trùng. ⛔ Không `dayjs(x).tz()`: Hermes
 * đọc lại chuỗi `toLocaleString` bằng `new Date()` ⇒ ra thẳng "Invalid Date". ⚠️ So GIỜ TƯỜNG, không so tên (`Asia/Saigon` ≡ `Asia/Ho_Chi_Minh`).
 */
export function meetingZoneNote(
  startAt: string,
  meetingTz: string,
  deviceTz: string = deviceTimeZone(),
): string {
  if (!meetingTz || !isValidTimeZone(meetingTz)) return '';
  const at = isoToZoned(startAt, meetingTz);
  const device = isoToZoned(startAt, deviceTz);
  const same = at.dayKey === device.dayKey && at.time === device.time;
  return !at.time || same ? '' : `${at.time} giờ ${zoneShortName(meetingTz)}`;
}

/** Nhóm cuộc họp theo NGÀY (giờ thiết bị) — qua nửa đêm thuộc ngày bắt đầu; sắp theo `startAt`. */
export function groupByDay(
  items: readonly MeetingListItemDto[],
): { dayKey: string; items: MeetingListItemDto[] }[] {
  const sorted = items.slice().sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const groups = new Map<string, MeetingListItemDto[]>();
  for (const item of sorted) {
    const key = dayjs(item.startAt).format('YYYY-MM-DD');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([dayKey, list]) => ({ dayKey, items: list }));
}

/** Đầu tuần (thứ hai) của ngày, 00:00 giờ máy. */
export function startOfWeek(date: Date): Date {
  const d = dayjs(date).startOf('day');
  const offset = (d.day() + 6) % 7; // thứ hai = 0
  return d.subtract(offset, 'day').toDate();
}

export function addDays(date: Date, days: number): Date {
  return dayjs(date).add(days, 'day').toDate();
}

/** "Bắt đầu sau 12 phút" · "Bắt đầu sau 2 giờ 5 phút" · "Đang diễn ra 00:14:22" — `remainingMs` tính theo giờ SERVER. */
export function countdownText(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${String(days)} ngày ${String(hours)} giờ`;
  if (hours > 0) return `${String(hours)} giờ ${String(minutes)} phút`;
  if (minutes > 0) return `${String(minutes)} phút`;
  return `${String(total)} giây`;
}
