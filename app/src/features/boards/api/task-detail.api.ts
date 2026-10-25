/** Đường dẫn endpoint của p3-03 (be.md §4) — nối sau `appConfig.apiBaseUrl`. */

export function taskPath(taskId: string): string {
  return `/tasks/${taskId}`;
}

export function taskRestorePath(taskId: string): string {
  return `${taskPath(taskId)}/restore`;
}

export function taskChecklistPath(taskId: string): string {
  return `${taskPath(taskId)}/checklist`;
}

export function taskChecklistItemPath(taskId: string, itemId: string): string {
  return `${taskChecklistPath(taskId)}/${itemId}`;
}

/** p3-03 P1: theo dõi thẻ — `PUT` bật, `DELETE` tắt. */
export function taskWatchPath(taskId: string): string {
  return `${taskPath(taskId)}/watch`;
}

export function taskWatchersPath(taskId: string): string {
  return `${taskPath(taskId)}/watchers`;
}

/** p3-03 P1: `POST` sao chép thẻ. */
export function taskDuplicatePath(taskId: string): string {
  return `${taskPath(taskId)}/duplicate`;
}

/** p3-03 P1: `POST` chuyển một mục checklist thành thẻ. */
export function taskChecklistConvertPath(taskId: string, itemId: string): string {
  return `${taskChecklistItemPath(taskId, itemId)}/convert`;
}

export function taskAttachmentsPath(taskId: string): string {
  return `${taskPath(taskId)}/attachments`;
}

export function taskAttachmentPath(taskId: string, assetId: string): string {
  return `${taskAttachmentsPath(taskId)}/${assetId}`;
}

export function taskActivityPath(taskId: string): string {
  return `${taskPath(taskId)}/activity`;
}

export function taskCommentsPath(taskId: string): string {
  return `${taskPath(taskId)}/comments`;
}

export function taskCommentPath(commentId: string): string {
  return `/task-comments/${commentId}`;
}

export function boardMentionablesPath(boardId: string): string {
  return `/boards/${boardId}/mentionables`;
}
