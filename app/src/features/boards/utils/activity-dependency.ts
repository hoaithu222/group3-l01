import { formatDate } from '@/shared/utils/format/date.utils';

import type { TaskActivityDto } from '../api/task-detail.types';
import { pickText } from './json-pick';

/** Tra tiêu đề thẻ theo id (từ cache) — BE chỉ ghi id trong activity phụ thuộc/dời lịch. */
export type ResolveTask = (taskId: string) => string | undefined;

const nameOf = (taskId: string, resolveTask?: ResolveTask): string => {
  const title = resolveTask?.(taskId);
  return title ? `"${title}"` : 'một thẻ khác';
};

/**
 * Câu cho `DEPENDENCY_ADDED` / `DEPENDENCY_REMOVED` (p4-04 be.md §5.1). MỖI đầu của cạnh có một bản ghi riêng:
 * ở thẻ SAU là `{ predecessorId }` ("thẻ này chờ thẻ X"), ở thẻ TRƯỚC là `{ successorId }` ("thẻ Y chờ thẻ này") —
 * gỡ thì nằm ở `before`. Thiếu cả hai (BE đổi tên khoá) → câu chung, không vỡ.
 */
export function dependencyActionText(
  activity: TaskActivityDto,
  added: boolean,
  resolveTask?: ResolveTask,
): string {
  const source = added ? activity.after : (activity.before ?? activity.after);
  const predecessor = pickText(source, 'predecessorId');
  const successor = pickText(source, 'successorId');
  const verb = added ? 'đã thêm phụ thuộc' : 'đã gỡ phụ thuộc';

  if (predecessor) {
    const target = nameOf(predecessor, resolveTask);
    return added
      ? `${verb}: thẻ này chờ thẻ ${target} xong`
      : `${verb}: thẻ này không còn chờ thẻ ${target}`;
  }
  if (successor) {
    const target = nameOf(successor, resolveTask);
    return added
      ? `${verb}: thẻ ${target} chờ thẻ này xong`
      : `${verb}: thẻ ${target} không còn chờ thẻ này`;
  }
  return verb;
}

/**
 * Câu cho `RESCHEDULED` (p4-04 be.md §5.4): thẻ bị dời lịch do thẻ TRƯỚC đổi hạn — ghi rõ "do thẻ A" để người làm hiểu
 * vì sao thẻ của mình nhảy (README p4-04 §10). `sourceTaskId` đọc mềm ở `after`/`before` (be.md chưa chốt chỗ đặt).
 */
export function rescheduledActionText(activity: TaskActivityDto, resolveTask?: ResolveTask): string {
  const due = pickText(activity.after, 'dueDate');
  const sourceId = pickText(activity.after, 'sourceTaskId') ?? pickText(activity.before, 'sourceTaskId');
  const cause = sourceId ? ` do thẻ ${nameOf(sourceId, resolveTask)} đổi hạn` : ' theo phụ thuộc';
  return due ? `đã dời hạn chót sang ${formatDate(due, due)}${cause}` : `đã dời lịch thẻ${cause}`;
}
