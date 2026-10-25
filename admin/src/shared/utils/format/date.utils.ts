/**
 * Phép TOÁN trên ngày giờ (dayjs).
 *
 * Ở CÙNG nhóm `format` với `formatDate`/`formatRelativeTime` — cùng một chỗ
 * cần tới ngày tháng thì cần cả hai: tính ra mốc rồi in mốc đó ra chuỗi. Tách
 * thành nhóm riêng chỉ tổ bắt người dùng nhớ hai đường import cho một việc.
 *
 * ⛔ KHÔNG bọc thêm một lớp API riêng quanh dayjs. Mọi hàm ở đây chỉ gom lại
 * những phép hay dùng và CHUẨN HOÁ kiểu đầu vào; cần gì lạ hơn thì gọi thẳng
 * `dayjs()` chứ đừng phình file này thành một thư viện thứ hai.
 */

import dayjs, { type Dayjs } from 'dayjs';

/** Mọi dạng ngày mà các hàm dưới đây nhận. `number` = timestamp ms. */
export type DateInput = Date | string | number | Dayjs;

/** Đưa mọi dạng đầu vào về `Dayjs` để tính tiếp. */
export function parseDate(date: DateInput): Dayjs {
  return dayjs(date);
}

/** Mốc đã QUA so với hiện tại chưa. */
export function isExpired(date: DateInput): boolean {
  return dayjs(date).isBefore(dayjs());
}

/** Cộng `days` ngày (số âm = lùi lại). */
export function addDays(date: DateInput, days: number): Dayjs {
  return dayjs(date).add(days, 'day');
}

/** 00:00:00.000 của ngày đó. */
export function startOfDay(date: DateInput): Dayjs {
  return dayjs(date).startOf('day');
}

/** 23:59:59.999 của ngày đó. */
export function endOfDay(date: DateInput): Dayjs {
  return dayjs(date).endOf('day');
}

/**
 * Chuỗi ISO 8601 (UTC) — dạng gửi lên API.
 *
 * ⛔ KHÔNG dùng `String(date)` hay `date.toString()`: hai cách đó ra chuỗi theo
 * ngôn ngữ/múi giờ của máy, mỗi máy một kiểu và máy chủ không parse nổi.
 */
export function toISOString(date: DateInput): string {
  return dayjs(date).toISOString();
}

/** Đọc chuỗi ISO 8601 về `Dayjs`. */
export function fromISOString(iso: string): Dayjs {
  return dayjs(iso);
}

/** Hai mốc có rơi vào CÙNG MỘT NGÀY lịch không (bỏ qua giờ). */
export function isSameDay(a: DateInput, b: DateInput): boolean {
  return dayjs(a).isSame(dayjs(b), 'day');
}

/** Định dạng ngày đặt trên URL cho bộ lọc khoảng ngày (`?from=2026-09-01`). */
export const URL_DATE_FORMAT = 'YYYY-MM-DD';

/**
 * Ngày trong URL (`YYYY-MM-DD`) → mốc ISO ĐẦU / CUỐI ngày theo giờ máy người xem — dạng gửi lên API cho
 * tham số khoảng ngày (`from`/`to`, `createdFrom`/`createdTo`…). Rỗng hoặc sai định dạng → `undefined` (bỏ
 * tham số thay vì gửi rác cho BE trả 400).
 */
export function dayBoundaryIso(value: string, edge: 'start' | 'end'): string | undefined {
  if (!value) return undefined;
  const day = dayjs(value);
  if (!day.isValid()) return undefined;
  return (edge === 'start' ? day.startOf('day') : day.endOf('day')).toISOString();
}

/** Ngày trong URL → `Date` cho `RangeDatePicker`; rỗng hoặc sai định dạng → `null`. */
export function urlDateToDate(value: string): Date | null {
  const day = value ? dayjs(value) : null;
  return day?.isValid() ? day.toDate() : null;
}
