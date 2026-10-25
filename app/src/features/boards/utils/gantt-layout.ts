import type { GanttRange, GanttTaskDto } from '../api/critical-path.types';
import { dayNumberIn } from './zoned-date';

/**
 * Hình học THUẦN của biểu đồ Gantt (app.md §2 `utils/gantt-layout.ts`): ngày → x, hàng, toạ độ mũi tên, vùng nhìn
 * thấy. Không React, không đồng hồ — test được kỹ mọi ca biên (`gantt-layout.test.ts`) mà không dựng SVG.
 *
 * Mọi "ngày" là NGÀY LỊCH trong múi giờ của server (`zoned-date.ts`); trục và thanh cùng dùng một số ngày nên
 * một thẻ hạn 23:30 và một thẻ hạn 00:30 hôm sau không bao giờ rơi cùng cột.
 */

export interface Timeline {
  /** Số ngày (kể từ 1970) của cột ĐẦU TIÊN. */
  fromDay: number;
  /** Số cột ngày, ≥ 1. */
  days: number;
  dayWidth: number;
  /** Tổng bề rộng nội dung = `days * dayWidth`. */
  width: number;
}

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarGeometry extends BarRect {
  /** Thanh bị cắt ở mép trái/phải vì thẻ kéo dài ra ngoài khoảng đang xem. */
  clippedEnd: boolean;
  clippedStart: boolean;
  /** Thứ tự cột ngày (0-based) của đầu/cuối thanh SAU khi cắt. */
  endIndex: number;
  startIndex: number;
}

export function buildTimeline(range: GanttRange, tz: string, dayWidth: number): Timeline {
  const fromDay = dayNumberIn(range.from, tz);
  const days = Math.max(1, dayNumberIn(range.to, tz) - fromDay + 1);
  return { dayWidth, days, fromDay, width: days * dayWidth };
}

/** x (dp) của mép TRÁI của cột ngày `index`. */
export function xOfDay(timeline: Timeline, index: number): number {
  return index * timeline.dayWidth;
}

/** Thứ tự cột của một số ngày — có thể âm hoặc ≥ `days` khi nằm ngoài khoảng đang xem. */
export function indexOfDay(timeline: Timeline, day: number): number {
  return day - timeline.fromDay;
}

/**
 * Thanh của một thẻ. Mốc bắt đầu = `startDate ?? dueDate`, mốc cuối = `dueDate ?? startDate` (thẻ chỉ có một
 * ngày → thanh một ô, đóng vai cột mốc). Cả hai đều BAO GỒM ngày đó, nên thẻ 25→25 rộng đúng một ngày.
 * `null` khi thẻ không có ngày nào hoặc nằm hẳn ngoài khoảng — BE đã lọc theo giao khoảng nhưng múi giờ máy/server có
 * thể lệch một ngày ở mép.
 */
export function barGeometry(
  task: Pick<GanttTaskDto, 'dueDate' | 'startDate'>,
  timeline: Timeline,
  tz: string,
  row: { height: number; index: number },
): BarGeometry | null {
  const start = task.startDate ?? task.dueDate;
  const end = task.dueDate ?? task.startDate;
  if (!start || !end) return null;

  const rawStart = indexOfDay(timeline, dayNumberIn(start, tz));
  // `dueDate` trước `startDate` là dữ liệu hỏng (BE chặn bằng `TASK_013`) — vẫn vẽ được, không đảo thành âm.
  const rawEnd = Math.max(rawStart, indexOfDay(timeline, dayNumberIn(end, tz)));
  const last = timeline.days - 1;
  if (rawEnd < 0 || rawStart > last) return null;

  const startIndex = Math.max(0, rawStart);
  const endIndex = Math.min(last, rawEnd);
  return {
    clippedEnd: rawEnd > last,
    clippedStart: rawStart < 0,
    endIndex,
    height: row.height,
    startIndex,
    width: (endIndex - startIndex + 1) * timeline.dayWidth,
    x: xOfDay(timeline, startIndex),
    y: row.index * row.height,
  };
}

/**
 * Thứ tự hàng (app.md §3 "hàng theo cột → thẻ"): theo THỨ TỰ CỘT của bảng (`columnOrder`), trong cột theo ngày bắt đầu rồi tiêu đề —
 * ổn định giữa hai lần tải (không nhảy hàng khi dữ liệu đổi nhẹ). Thẻ thiếu `columnId` (BE cũ) hoặc cột lạ xếp CUỐI, vẫn theo ngày;
 * `columnOrder` rỗng ⇒ chỉ sắp theo ngày.
 */
export function sortGanttTasks(tasks: readonly GanttTaskDto[], columnOrder: readonly string[] = []): GanttTaskDto[] {
  const rank = new Map(columnOrder.map((id, index) => [id, index]));
  const column = (task: GanttTaskDto) => (task.columnId === undefined ? undefined : rank.get(task.columnId)) ?? columnOrder.length;
  const key = (task: GanttTaskDto) => task.startDate ?? task.dueDate ?? '';
  return [...tasks].sort(
    (a, b) => column(a) - column(b) || key(a).localeCompare(key(b)) || a.title.localeCompare(b.title),
  );
}

/**
 * Dải hàng cần vẽ (ảo hoá theo vùng nhìn thấy, app.md §2): `[first, last]` BAO GỒM, đã cộng `overscan` hàng mỗi phía.
 * Không có hàng nào → `{ first: 0, last: -1 }` (vòng lặp `first..last` không chạy).
 */
export function visibleRowRange(input: {
  overscan: number;
  rowCount: number;
  rowHeight: number;
  scrollY: number;
  viewportHeight: number;
}): { first: number; last: number } {
  const { overscan, rowCount, rowHeight, scrollY, viewportHeight } = input;
  if (rowCount <= 0) return { first: 0, last: -1 };
  const first = Math.max(0, Math.floor(scrollY / rowHeight) - overscan);
  const last = Math.min(rowCount - 1, Math.ceil((scrollY + viewportHeight) / rowHeight) + overscan);
  return { first: Math.min(first, rowCount - 1), last };
}
