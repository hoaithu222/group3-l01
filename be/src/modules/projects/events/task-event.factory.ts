import type { Task } from "../entities/task.interface";
import {
  TASK_EVENTS,
  taskEventKeys,
  type TaskAssignedPayload,
  type TaskCommentCreatedPayload,
  type TaskCommentUpdatedPayload,
  type TaskCompletedPayload,
  type TaskCreatedPayload,
  type TaskDeletedRestoredPayload,
  type TaskDueChangedPayload,
  type TaskReopenedPayload,
  type TaskReviewMeta,
} from "./project-events";

interface Keyed<P> {
  payload: P;
  dedupeKey: string;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const base = (task: Task, actorId: string | null) => ({
  taskId: task.id,
  boardId: task.boardId,
  workspaceId: task.workspaceId,
  actorId,
});

/** Phase 3 chưa có policy review → luôn "không bật/không duyệt"; p4-05 ghi đè qua `TaskCompletionMeta`. */
export const DEFAULT_REVIEW_META: TaskReviewMeta = { enabled: false, approved: false };

export function createdEvent(task: Task, actorId: string): Keyed<TaskCreatedPayload> {
  return {
    dedupeKey: taskEventKeys.created(task.id),
    payload: {
      event: TASK_EVENTS.CREATED,
      ...base(task, actorId),
      columnId: task.columnId,
      createdBy: task.createdBy,
      assigneeIds: task.assigneeIds,
      dueDate: iso(task.dueDate),
      createdAt: task.createdAt.toISOString(),
    },
  };
}

/**
 * `null` khi không có ai MỚI được giao (loại chính người thực hiện). `onlyIds` (PATCH) = chỉ những người VỪA được thêm;
 * vắng (tạo thẻ) = mọi người làm của thẻ.
 */
export function assignedEvent(task: Task, actorId: string, suffix: string, onlyIds?: string[]): Keyed<TaskAssignedPayload> | null {
  const assigneeIds = (onlyIds ?? task.assigneeIds).filter((id) => id !== actorId);
  if (assigneeIds.length === 0) return null;
  return {
    dedupeKey: taskEventKeys.assigned(task.id, suffix),
    payload: { event: TASK_EVENTS.ASSIGNED, ...base(task, actorId), assigneeIds },
  };
}

export function dueChangedEvent(
  task: Task,
  actorId: string,
  oldDue: Date | null
): Keyed<TaskDueChangedPayload> {
  return {
    dedupeKey: taskEventKeys.dueChanged(task.id, task.dueVersion),
    payload: {
      event: TASK_EVENTS.DUE_CHANGED,
      ...base(task, actorId),
      oldDue: iso(oldDue),
      newDue: iso(task.dueDate),
      dueVersion: task.dueVersion,
    },
  };
}

/** `task` = thẻ SAU khi hoàn thành (`completedAt`, `completionCount` đã cập nhật). */
export function completedEvent(
  task: Task,
  actorId: string | null,
  labelNames: string[],
  review: TaskReviewMeta = DEFAULT_REVIEW_META
): Keyed<TaskCompletedPayload> {
  const completedAt = task.completedAt ?? new Date();
  return {
    dedupeKey: taskEventKeys.completed(task.id, task.completionCount),
    payload: {
      event: TASK_EVENTS.COMPLETED,
      ...base(task, actorId),
      assigneeIds: task.assigneeIds,
      storyPoints: task.storyPoints,
      dueDate: iso(task.dueDate),
      completedAt: completedAt.toISOString(),
      onTime: task.dueDate !== null && completedAt.getTime() <= task.dueDate.getTime(),
      completionCount: task.completionCount,
      taskCreatedAt: task.createdAt.toISOString(),
      labelNames,
      review,
    },
  };
}

/** `task` = thẻ SAU khi xoá mềm (`version` mới nằm trong `dedupeKey`). `columnId` = cột lúc xoá. */
export function deletedEvent(task: Task, actorId: string, columnId: string): Keyed<TaskDeletedRestoredPayload> {
  return {
    dedupeKey: taskEventKeys.deleted(task.id, task.version),
    payload: { event: TASK_EVENTS.DELETED, ...base(task, actorId), columnId },
  };
}

/** `task` = thẻ SAU khi khôi phục; `columnId` = cột đã khôi phục về. */
export function restoredEvent(task: Task, actorId: string): Keyed<TaskDeletedRestoredPayload> {
  return {
    dedupeKey: taskEventKeys.restored(task.id, task.version),
    payload: { event: TASK_EVENTS.RESTORED, ...base(task, actorId), columnId: task.columnId },
  };
}

export function commentCreatedEvent(
  task: Task,
  comment: { id: string; authorId: string },
  mentionIds: string[]
): Keyed<TaskCommentCreatedPayload> {
  return {
    dedupeKey: taskEventKeys.commentCreated(comment.id),
    payload: {
      event: TASK_EVENTS.COMMENT_CREATED,
      ...base(task, comment.authorId),
      commentId: comment.id,
      mentionIds,
      assigneeIds: task.assigneeIds,
      createdBy: task.createdBy,
    },
  };
}

export function commentUpdatedEvent(
  task: Task,
  comment: { id: string; authorId: string; version: number },
  newMentionIds: string[]
): Keyed<TaskCommentUpdatedPayload> {
  return {
    dedupeKey: taskEventKeys.commentUpdated(comment.id, comment.version),
    payload: {
      event: TASK_EVENTS.COMMENT_UPDATED,
      ...base(task, comment.authorId),
      commentId: comment.id,
      commentVersion: comment.version,
      mentionIds: newMentionIds,
    },
  };
}

export function reopenedEvent(task: Task, actorId: string | null, reopenedAt: Date): Keyed<TaskReopenedPayload> {
  return {
    dedupeKey: taskEventKeys.reopened(task.id, task.completionCount),
    payload: {
      event: TASK_EVENTS.REOPENED,
      ...base(task, actorId),
      assigneeIds: task.assigneeIds,
      completionCount: task.completionCount,
      reopenedAt: reopenedAt.toISOString(),
    },
  };
}
