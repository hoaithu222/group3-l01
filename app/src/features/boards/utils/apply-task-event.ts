import type {
  BoardFilter,
  BoardTasksData,
  ColumnKind,
  MoveTaskResult,
  TaskCardDto,
  TaskEvent,
} from '../api/boards.types';
import { hasActiveFilter, matchesFilter } from './board-filter';
import { findTask, insertTask, removeTask } from './board-tasks-data';

/**
 * Reducer THUẦN: cache thẻ + một sự kiện realtime → cache mới (app.md §4
 * "Sự kiện realtime"). Không React, không socket, không đồng hồ — nên test được
 * kỹ mọi ca thứ tự/trùng/cũ (`apply-task-event.test.ts`).
 *
 * ── Ba luật giữ cho hai máy hội tụ về cùng một trạng thái ───────────────────
 *  1. **Sự kiện CŨ hơn hoặc BẰNG bản đã có bị bỏ** (`version <=`). Socket không
 *     đảm bảo thứ tự tới, và sự kiện của CHÍNH MÌNH luôn tới sau khi HTTP đã ghi
 *     `version` mới vào cache — luật này tự loại nó, không cần dò `clientMutationId`
 *     (cái đó do hook lo cho khoảng thời gian HTTP còn đang bay).
 *  2. **Sự kiện trùng vô hại** (áp hai lần = áp một lần), vì lần hai có
 *     `version <=` bản vừa ghi.
 *  3. **Thẻ chưa có trong cache mà không đoán được** → `stale: true` để hook
 *     tải lại, ⛔ không bịa thẻ từ payload thiếu trường (`task:moved` không mang
 *     tiêu đề/người làm).
 */
export interface ApplyContext {
  currentUserId?: string;
  filter: BoardFilter;
  /** Đồng hồ tiêm vào để test — mặc định `Date.now()`. */
  now?: number;
}

export interface ApplyResult {
  data: BoardTasksData;
  /** `true` ⇒ cache này không tự vá được, nên tải lại. */
  stale: boolean;
}

/** `isOverdue` phía server = `dueDate < now && columnKind != DONE` (be.md §5 List). */
export function computeOverdue(dueDate: string | null, kind: ColumnKind, now: number): boolean {
  if (!dueDate || kind === 'DONE') return false;
  return new Date(dueDate).getTime() < now;
}

function applyMoved(
  data: BoardTasksData,
  patch: MoveTaskResult,
  ctx: ApplyContext,
): ApplyResult {
  const existing = findTask(data, patch.id);

  if (!existing) {
    // Cache không lọc mà không thấy thẻ ⇒ thẻ mới hoặc nằm ngoài `limitPerColumn`.
    // Cache có lọc ⇒ nhiều khả năng thẻ bị lọc ra — chỉ trường hợp `overdue`
    // (rời cột DONE có thể làm thẻ hoá quá hạn) mới đáng tải lại.
    const stale = !hasActiveFilter(ctx.filter) || Boolean(ctx.filter.overdue);
    return { data, stale };
  }
  if (patch.version <= existing.version) return { data, stale: false };

  const moved: TaskCardDto = {
    ...existing,
    columnId: patch.columnId,
    columnKind: patch.columnKind,
    completedAt: patch.completedAt,
    isOverdue: computeOverdue(existing.dueDate, patch.columnKind, ctx.now ?? Date.now()),
    position: patch.position,
    version: patch.version,
  };
  const without = removeTask(data, patch.id);
  const next = matchesFilter(moved, ctx.filter, ctx.currentUserId)
    ? insertTask(without, moved)
    : without;
  return { data: next, stale: false };
}

/**
 * p4-05: `review` (tiến độ "1/2") chỉ có ở danh sách và ở `task:updated { changed: ["review"] }`; bản dựng khác (chi tiết thẻ, PATCH) không
 * mang — thẻ vẫn `PENDING` thì GIỮ giá trị đã có thay vì để chip mất số đếm. Rời PENDING thì bỏ (không có lượt mở nào để đếm).
 */
function keepReviewProgress(task: TaskCardDto, existing: TaskCardDto | undefined): TaskCardDto {
  if (task.review !== undefined || task.reviewState !== 'PENDING' || !existing?.review) return task;
  return { ...task, review: existing.review };
}

function applyUpsert(data: BoardTasksData, incoming: TaskCardDto, ctx: ApplyContext): ApplyResult {
  const existing = findTask(data, incoming.id);
  if (existing && incoming.version <= existing.version) return { data, stale: false };
  const task = keepReviewProgress(incoming, existing);

  if (!matchesFilter(task, ctx.filter, ctx.currentUserId)) {
    return { data: existing ? removeTask(data, task.id) : data, stale: false };
  }
  return { data: insertTask(data, task), stale: false };
}

export function applyTaskEvent(
  data: BoardTasksData,
  event: TaskEvent,
  ctx: ApplyContext,
): ApplyResult {
  switch (event.type) {
    case 'created':
    case 'updated':
      return applyUpsert(data, event.task, ctx);
    case 'moved':
      return applyMoved(data, event.patch, ctx);
    case 'deleted':
      return { data: removeTask(data, event.id), stale: false };
  }
}
