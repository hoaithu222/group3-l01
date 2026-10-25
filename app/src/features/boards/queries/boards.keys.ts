import type { BoardFilter } from '../api/boards.types';
import type { GanttRange } from '../api/critical-path.types';
import { normalizeFilter } from '../utils/board-filter';

/**
 * Khoá React Query (`app.md` §4). Mọi tham số ảnh hưởng kết quả đều nằm trong
 * khoá — riêng `tasks` có thêm bộ lọc ĐÃ CHUẨN HOÁ để `overdue:false` và bỏ
 * trống ra cùng một khoá.
 *
 * `tasksAll(boardId)` là tiền tố dùng để vá/dọn MỌI cache thẻ của một bảng (mỗi
 * bộ lọc một cache) — reducer realtime áp sự kiện lên tất cả.
 */
export const boardKeys = {
  all: ['boards'] as const,
  list: (workspaceId: string, archived: boolean) =>
    [...boardKeys.all, 'list', workspaceId, archived] as const,
  detail: (boardId: string) => [...boardKeys.all, 'detail', boardId] as const,
  tasksAll: (boardId: string) => [...boardKeys.all, 'tasks', boardId] as const,
  tasks: (boardId: string, filter: BoardFilter) =>
    [...boardKeys.tasksAll(boardId), normalizeFilter(filter)] as const,
  members: (workspaceId: string, q: string) =>
    [...boardKeys.all, 'members', workspaceId, q] as const,
  /** p3-02 P1: mẫu bảng dựng sẵn — dữ liệu tĩnh, không phụ thuộc nhóm. */
  templates: () => [...boardKeys.all, 'templates'] as const,
  /** p4-04: tiền tố để dọn/tải lại MỌI khoảng ngày của Gantt một bảng (mỗi khoảng một cache). */
  ganttAll: (boardId: string) => [...boardKeys.all, 'gantt', boardId] as const,
  gantt: (boardId: string, range: GanttRange) => [...boardKeys.ganttAll(boardId), range] as const,
  rescheduleBatch: (batchId: string) => [...boardKeys.all, 'reschedule-batch', batchId] as const,
};
