import dayjs from 'dayjs';

import type { GanttRange } from '../api/critical-path.types';
import type { GanttRangeKey } from '../constants/critical-path.constants';

/** Khoá `AsyncStorage` nhớ mức xem gần nhất (app.md §5): `boards:gantt-range:<userId>:<boardId>`. */
export function ganttRangeStorageKey(userId: string, boardId: string): string {
  return `boards:gantt-range:${userId}:${boardId}`;
}

/**
 * Mức xem → khoảng ngày gửi `GET /boards/:id/gantt`. Neo vào ĐẦU tuần (thứ Hai) hoặc ĐẦU tháng của ngày `today`
 * theo giờ máy: khoảng không đổi trong cả ngày nên khoá React Query ổn định (không gọi lại mỗi lần vẽ).
 * Cả ba mức ≤ 92 ngày, dưới trần 366 của BE (`LIMITS.gantt.rangeMaxDays`). Lệch một ngày ở mép do khác múi giờ với
 * server là chấp nhận được: trục vẽ theo `from/to` mà server ECHO LẠI, và thanh cắt theo trục đó.
 */
export function ganttRangeFor(key: GanttRangeKey, today: Date = new Date()): GanttRange {
  const now = dayjs(today).startOf('day');
  // `day()`: 0 = Chủ nhật → lùi (day + 6) % 7 ngày để về thứ Hai.
  const monday = now.subtract((now.day() + 6) % 7, 'day');
  const monthStart = now.startOf('month');
  const [from, to] =
    key === '2w'
      ? [monday, monday.add(14, 'day')]
      : key === 'month'
        ? [monthStart, monthStart.add(1, 'month')]
        : [monthStart, monthStart.add(3, 'month')];
  return { from: from.toISOString(), to: to.toISOString() };
}

export function isGanttRangeKey(value: unknown): value is GanttRangeKey {
  return value === '2w' || value === 'month' || value === 'quarter';
}
