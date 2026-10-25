import type { GanttTaskDto } from '../api/critical-path.types';
import { dayNumberIn, formatDayNumber, todayNumberIn } from './zoned-date';

export interface MilestoneSection {
  /** Số ngày (kể từ 1970) của thứ Hai đầu tuần, dạng chuỗi — khoá ổn định của section (`SectionList` đòi `string`). */
  key: string;
  title: string;
  /** Tuần chứa hôm nay — màn cuộn tới đây khi mở. */
  isCurrent: boolean;
  data: GanttTaskDto[];
}

/** Thứ Hai đầu tuần của một số ngày: 1970-01-01 là thứ Năm nên thứ trong tuần (T2 = 0) = `(ngày + 3) % 7`. */
export function weekStartOf(day: number): number {
  return day - ((((day + 3) % 7) + 7) % 7);
}

/**
 * Nhóm thẻ theo TUẦN của mốc (hạn chót, không có thì ngày bắt đầu) — danh sách mốc của điện thoại (app.md §3).
 * Trong tuần sắp theo mốc rồi tiêu đề; tuần sắp tăng dần. Thẻ không có ngày nào (BE không trả, nhưng dữ liệu cache
 * cũ có thể) bị bỏ, không tạo section rỗng.
 */
export function groupByWeek(
  tasks: readonly GanttTaskDto[],
  tz: string,
  now: Date = new Date(),
): MilestoneSection[] {
  const currentWeek = weekStartOf(todayNumberIn(tz, now));
  const byWeek = new Map<number, { day: number; task: GanttTaskDto }[]>();

  for (const task of tasks) {
    const milestone = task.dueDate ?? task.startDate;
    if (!milestone) continue;
    const day = dayNumberIn(milestone, tz);
    const week = weekStartOf(day);
    byWeek.set(week, [...(byWeek.get(week) ?? []), { day, task }]);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, items]) => ({
      data: items
        .sort((a, b) => a.day - b.day || a.task.title.localeCompare(b.task.title))
        .map((item) => item.task),
      isCurrent: week === currentWeek,
      key: String(week),
      title: `Tuần ${formatDayNumber(week)} – ${formatDayNumber(week + 6)}`,
    }));
}
