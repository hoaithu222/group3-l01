/**
 * Đường dẫn endpoint của p4-04 (be.md §4) — nối sau `appConfig.apiBaseUrl`.
 * `:id` của phụ thuộc là thẻ SAU (bị chặn); thẻ TRƯỚC (đang chặn) đi trong thân/đường dẫn.
 */

export function taskDependenciesPath(taskId: string): string {
  return `/tasks/${taskId}/dependencies`;
}

export function taskDependencyPath(successorId: string, predecessorId: string): string {
  return `${taskDependenciesPath(successorId)}/${predecessorId}`;
}

export function taskReschedulePreviewPath(taskId: string): string {
  return `/tasks/${taskId}/reschedule-preview`;
}

export function taskReschedulePath(taskId: string): string {
  return `/tasks/${taskId}/reschedule`;
}

export function rescheduleBatchPath(batchId: string): string {
  return `/reschedule-batches/${batchId}`;
}

export function boardGanttPath(boardId: string): string {
  return `/boards/${boardId}/gantt`;
}
