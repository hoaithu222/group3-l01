import { CRON_WEEKDAYS } from '../constants/wallet.constants';

/**
 * Lịch nhắc nợ HẰNG TUẦN ↔ cron `m h * * d`. BE chỉ nhận đúng dạng này
 * (`weeklyCronSchema`: phút 0–59, giờ 0–23, thứ 0–6 với 0 = Chủ nhật) nên UI chỉ
 * cho chọn thứ + giờ + phút, không cho gõ cron tự do.
 */

export interface ReminderSchedule {
  weekday: number;
  hour: number;
  minute: number;
}

const CRON_RE = /^([0-5]?\d) ([01]?\d|2[0-3]) \* \* ([0-6])$/;

export function scheduleToCron({ hour, minute, weekday }: ReminderSchedule): string {
  return `${minute} ${hour} * * ${weekday}`;
}

/** `null` khi cron không phải dạng hằng tuần (vd BE đổi mặc định) — UI khi đó dùng lịch mặc định. */
export function cronToSchedule(cron: string): ReminderSchedule | null {
  const match = CRON_RE.exec(cron.trim());
  if (!match) return null;
  return { minute: Number(match[1]), hour: Number(match[2]), weekday: Number(match[3]) };
}

const pad2 = (value: number) => String(value).padStart(2, '0');

export function formatTimeOfDay(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function describeSchedule(schedule: ReminderSchedule): string {
  const day = CRON_WEEKDAYS.find((item) => item.value === schedule.weekday)?.label ?? '';
  return `${day} · ${formatTimeOfDay(schedule.hour, schedule.minute)}`;
}

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Múi giờ máy — `Intl` chỉ dùng để ĐỌC tên vùng (không định dạng ngày/tiền), lỗi thì về giờ Việt Nam. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Danh sách gọn cho bộ chọn; luôn có múi giờ đang lưu và múi giờ của máy dù nằm ngoài danh sách. */
export function timezoneOptions(current: string, device: string = deviceTimezone()): string[] {
  const base = [
    DEFAULT_TIMEZONE,
    'Asia/Bangkok',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Los_Angeles',
  ];
  return Array.from(new Set([current, device, ...base]));
}
