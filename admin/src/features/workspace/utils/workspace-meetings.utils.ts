import {
  endOfDay,
  formatDate,
  formatTimeInZone,
  getBrowserTimeZone,
  isValidTimeZone,
  parseDate,
  startOfDay,
  toISOString,
} from '@/shared/utils/format';

import type { AdminMeetingListParams, AdminMeetingRow, MeetingStatusValue } from '../types/workspace-meetings.types';

/** Định dạng ngày trong URL (`?meetingFrom=` / `?meetingTo=`). */
export const MEETING_URL_DATE_FORMAT = 'YYYY-MM-DD';

const STATUSES: ReadonlySet<string> = new Set<MeetingStatusValue>(['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED']);

/** Giá trị `?meetingStatus=` hợp lệ → dùng; lạ/rỗng → `undefined` (không lọc — URL do người dùng sửa được). */
export function parseMeetingStatus(value: string): MeetingStatusValue | undefined {
  return STATUSES.has(value) ? (value as MeetingStatusValue) : undefined;
}

/** Ngày `YYYY-MM-DD` trong URL → mốc ISO đầu/cuối ngày (giờ máy người xem); sai định dạng → bỏ. */
export function dayBoundaryIso(value: string, edge: 'start' | 'end'): string | undefined {
  if (!value) return undefined;
  const day = parseDate(value);
  if (!day.isValid()) return undefined;
  return toISOString(edge === 'start' ? startOfDay(day) : endOfDay(day));
}

/** Ngày trong URL → `Date` cho `RangeDatePicker`; sai định dạng → `null`. */
export function urlDateToDate(value: string): Date | null {
  const day = value ? parseDate(value) : null;
  return day?.isValid() ? day.toDate() : null;
}

/** `Date` của `RangeDatePicker` → ngày trong URL; `null` → xoá khoá. */
export const dateToUrl = (d: Date | null): string | null => (d ? formatDate(d, MEETING_URL_DATE_FORMAT) : null);

/** Tham số gọi API từ giá trị URL (chỉ khoá có giá trị hợp lệ). */
export function toMeetingListParams(input: {
  page: number;
  limit: number;
  status: string;
  from: string;
  to: string;
}): AdminMeetingListParams {
  const status = parseMeetingStatus(input.status);
  const from = dayBoundaryIso(input.from, 'start');
  const to = dayBoundaryIso(input.to, 'end');
  return {
    page: input.page,
    limit: input.limit,
    ...(status && { status }),
    ...(from && { from }),
    ...(to && { to }),
  };
}

/**
 * Hai dòng thời gian của một cuộc họp (admin.md §2.1): giờ theo TRÌNH DUYỆT (`HH:mm DD/MM/YYYY – HH:mm`) và, khi múi giờ cuộc họp khác múi giờ
 * trình duyệt, dòng phụ "giờ <múi giờ> HH:mm – HH:mm". Kết thúc khác ngày bắt đầu (theo giờ trình duyệt) → in cả ngày kết thúc.
 */
export function formatMeetingTimes(row: Pick<AdminMeetingRow, 'startAt' | 'endAt' | 'timezone'>): { main: string; local: string | null } {
  const sameDay = formatDate(row.startAt, 'DD/MM/YYYY') === formatDate(row.endAt, 'DD/MM/YYYY');
  const end = sameDay ? formatDate(row.endAt, 'HH:mm') : formatDate(row.endAt, 'HH:mm DD/MM/YYYY');
  const main = `${formatDate(row.startAt, 'HH:mm DD/MM/YYYY')} – ${end}`;
  // Cuộc họp cũ/lạ có thể mang múi giờ hỏng ⇒ bỏ dòng "giờ theo múi giờ cuộc họp" thay vì ném lỗi khi vẽ bảng.
  const differs = row.timezone !== getBrowserTimeZone() && isValidTimeZone(row.timezone);
  const zoned = (iso: string) => formatTimeInZone(iso, row.timezone);
  return { main, local: differs ? `giờ ${row.timezone} ${zoned(row.startAt)} – ${zoned(row.endAt)}` : null };
}
