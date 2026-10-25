import dayjs from 'dayjs';
import 'dayjs/locale/vi';

import { deviceTimeZone } from '@/shared/utils/datetime';

/**
 * Giờ ĐỊA PHƯƠNG (giờ máy) ↔ mốc UTC gửi BE (p7-04 app.md §4 "Thời gian"). Người dùng chọn giờ theo đồng hồ MÁY; app gửi `sendAt`/`remindAt` là ISO UTC + `timezone` IANA
 * của máy (chỉ để hiển thị lại — BE phát đúng thời điểm UTC đã chốt, đổi múi giờ máy sau đó KHÔNG dời giờ phát, SCHED-04). Hiển thị luôn theo múi giờ MÁY HIỆN TẠI.
 *
 * ⛔ Không dùng `toLocaleString` để định dạng: Hermes cắt bớt ICU nên chữ ngày tháng khác nhau giữa Android/iOS (lý do đã ghi ở `date.utils.ts`) — dùng hằng tên thứ dưới đây.
 */

/** Hermes thiếu dữ liệu múi giờ → giờ Việt Nam (README p7-04 §4). */
export const FALLBACK_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function currentTimeZone(): string {
  return deviceTimeZone() ?? FALLBACK_TIMEZONE;
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'] as const;

/** "20:00 Thứ hai 21/09" — giờ máy. Ngày không hợp lệ → chuỗi rỗng. */
export function formatWhen(value: string | Date | number): string {
  const at = dayjs(value);
  if (!at.isValid()) return '';
  return `${at.format('HH:mm')} ${WEEKDAYS[at.day()] ?? ''} ${at.format('DD/MM')}`;
}

/** "Kết thúc 20:00 21/09" dùng cho hạn khảo sát (ngắn hơn `formatWhen`, khớp app.md §3 "Kết thúc HH:mm dd/MM"). */
export function formatDeadline(value: string | Date | number): string {
  const at = dayjs(value);
  return at.isValid() ? at.format('HH:mm DD/MM') : '';
}

/** `date` (ngày lịch trong giờ máy) + `time` `HH:mm` → `Date` lúc đó theo giờ máy; `time` sai định dạng → `null`. */
export function combineDateAndTime(date: Date, time: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return dayjs(date).hour(hours).minute(minutes).second(0).millisecond(0).toDate();
}

export interface WhenWindow {
  /** Cách hiện tại ít nhất bấy nhiêu ms (`limits.*.minLeadSeconds`). */
  minLeadMs: number;
  /** Không xa quá bấy nhiêu ms (`sendAtMaxDays`/`remindAtMaxDays`/`closesInMaxDays`). */
  maxMs: number;
}

/** Cửa sổ thời gian hợp lệ; trả câu lỗi tiếng Việt hoặc `null` khi hợp lệ. Cùng luật `isWithinWindow` của BE (`now + lead ≤ at ≤ now + max`). */
export function checkWhen(at: Date, nowMs: number, window: WhenWindow, subject: string): string | null {
  const ms = at.getTime();
  if (Number.isNaN(ms)) return 'Thời điểm không hợp lệ';
  if (ms < nowMs + window.minLeadMs) {
    const minutes = Math.max(1, Math.ceil(window.minLeadMs / 60_000));
    return `${subject} phải sau ít nhất ${minutes} phút kể từ bây giờ`;
  }
  if (ms > nowMs + window.maxMs) {
    const days = Math.floor(window.maxMs / 86_400_000);
    return `${subject} chỉ trong vòng ${days} ngày tới`;
  }
  return null;
}

/** Số ngày lịch → mili giây (cửa sổ `maxMs`). */
export const daysToMs = (days: number): number => days * 86_400_000;
