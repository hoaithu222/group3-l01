import dayjs from 'dayjs';

import type { GanttTaskDto, RescheduleChange } from '../api/critical-path.types';
/** Kéo cả thanh (đổi CẢ HAI ngày) hoặc kéo mép phải (chỉ đổi hạn chót). */
export type GanttDragMode = 'move' | 'resize';

const addDays = (iso: string, days: number): string => dayjs(iso).add(days, 'day').toISOString();

/**
 * Ngày MỚI của một thẻ sau khi kéo thanh `days` ngày (app.md §4 "Kéo thanh Gantt"). Cộng theo NGÀY LỊCH (giữ giờ trong
 * ngày) chứ không cộng `days * 24h` — không lệch giờ khi múi giờ máy có giờ mùa hè.
 *
 *  · `move` (kéo cả thanh): dời CẢ HAI ngày cùng khoảng, giữ nguyên thời lượng; thẻ chỉ có hạn chót thì dời hạn chót.
 *  · `resize` (kéo mép phải): chỉ đổi HẠN CHÓT, ngày bắt đầu giữ nguyên.
 *
 * `null` khi thẻ KHÔNG có hạn chót (chỉ có ngày bắt đầu: BE `reschedule` yêu cầu hạn chót, thanh chỉ là cột mốc — kéo
 * không có nghĩa) hoặc không có gì đổi. `startDate` LUÔN có mặt trong kết quả (giá trị hiện tại nếu không đổi) — cùng lý
 * do với `rescheduleChangeFrom`: không bao giờ để BE hiểu "bỏ trống" thành "xoá".
 */
export function shiftChange(
  task: Pick<GanttTaskDto, 'dueDate' | 'startDate'>,
  mode: GanttDragMode,
  days: number,
): RescheduleChange | null {
  if (!task.dueDate || days === 0) return null;
  const dueDate = addDays(task.dueDate, days);
  if (mode === 'resize') return { dueDate, startDate: task.startDate };
  return { dueDate, startDate: task.startDate ? addDays(task.startDate, days) : null };
}
