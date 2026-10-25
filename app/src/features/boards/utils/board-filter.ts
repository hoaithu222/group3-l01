import { matchesSearch } from '@/shared/utils/format/string.utils';

import type { BoardFilter, TaskCardDto } from '../api/boards.types';

/** `q` chỉ có nghĩa khi ≥ 2 ký tự (BE `listTasksQuery.q.min(2)`). */
export function hasActiveFilter(filter: BoardFilter): boolean {
  return Boolean(
    filter.assigneeId || filter.labelId || filter.overdue || (filter.q && filter.q.length >= 2),
  );
}

/**
 * Chuẩn hoá bộ lọc trước khi làm khoá query: bỏ trường rỗng/`false`, cắt khoảng
 * trắng. Hai bộ lọc "giống nhau về nghĩa" phải ra cùng khoá, nếu không đổi
 * `overdue: false` ↔ `undefined` sẽ gọi lại server oan.
 */
export function normalizeFilter(filter: BoardFilter): BoardFilter {
  const next: BoardFilter = {};
  if (filter.assigneeId) next.assigneeId = filter.assigneeId;
  if (filter.labelId) next.labelId = filter.labelId;
  if (filter.overdue) next.overdue = true;
  const q = filter.q?.trim();
  if (q && q.length >= 2) next.q = q;
  return next;
}

/**
 * Thẻ có khớp bộ lọc không — bản CLIENT của phép lọc server, dùng khi sự kiện
 * realtime đưa thẻ mới/đổi vào một cache đang lọc: khớp thì chèn, không thì bỏ.
 * ⚠️ Chỉ cần ĐỦ GẦN server; lệch nhỏ (vd ngày quá hạn theo múi giờ) được sửa ở
 * lần tải lại kế tiếp.
 */
export function matchesFilter(
  task: TaskCardDto,
  filter: BoardFilter,
  currentUserId: string | undefined,
): boolean {
  if (filter.assigneeId) {
    const wanted = filter.assigneeId === 'me' ? currentUserId : filter.assigneeId;
    if (!wanted || !task.assignees.some((assignee) => assignee.id === wanted)) return false;
  }
  if (filter.labelId && !task.labelIds.includes(filter.labelId)) return false;
  if (filter.overdue && !task.isOverdue) return false;
  if (filter.q && filter.q.length >= 2 && !matchesSearch(filter.q, task.title)) return false;
  return true;
}
