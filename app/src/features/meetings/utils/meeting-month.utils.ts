import dayjs from 'dayjs';

import type { MeetingListItemDto } from '../api/meetings.types';
import { addDays, startOfWeek, toDayKey } from './meeting-time.utils';

/** Hàm THUẦN cho lưới lịch THÁNG (tablet, app.md p2-04 §3). Mọi ngày là ngày theo giờ MÁY, tuần bắt đầu thứ hai. */

/** Ngày đầu tháng chứa `date`, 00:00 giờ máy. */
export function startOfMonth(date: Date): Date {
  return dayjs(date).startOf('month').toDate();
}

/** Lùi/tiến `delta` tháng; ngày 31 sang tháng 30 ngày thì kẹp về cuối tháng (dayjs làm sẵn), không tràn sang tháng sau. */
export function shiftMonth(date: Date, delta: number): Date {
  return dayjs(date).add(delta, 'month').toDate();
}

/** Số tuần (hàng) lưới cần để chứa cả tháng: 4–6. Dư hàng thứ sáu chỉ khi tháng thật sự cần. */
export function monthWeekCount(date: Date): number {
  const first = startOfMonth(date);
  const lead = (dayjs(first).day() + 6) % 7; // số ô của tháng trước chèn vào đầu hàng
  return Math.ceil((lead + dayjs(date).daysInMonth()) / 7);
}

/** Ô đầu tiên của lưới (thứ hai của tuần chứa ngày mùng 1). */
export function monthGridStart(date: Date): Date {
  return startOfWeek(startOfMonth(date));
}

/** Mọi ô của lưới, theo hàng: `monthWeekCount × 7` ngày liên tiếp. */
export function monthGridDays(date: Date): Date[] {
  const start = monthGridStart(date);
  return Array.from({ length: monthWeekCount(date) * 7 }, (_, index) => addDays(start, index));
}

/** "Tháng 9/2026". */
export function monthTitle(date: Date): string {
  return `Tháng ${dayjs(date).format('M/YYYY')}`;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return dayjs(a).isSame(b, 'month');
}

/** Số cuộc họp mỗi ngày (khoá `YYYY-MM-DD` giờ máy) — vẽ chấm/số trên ô ngày. Không đếm cuộc họp đã huỷ. */
export function countByDay(items: readonly MeetingListItemDto[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.status === 'CANCELLED') continue;
    const key = toDayKey(new Date(item.startAt));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
