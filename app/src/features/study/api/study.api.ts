/** Đường dẫn endpoint Study (be.md p4-01 §14) — nối sau `appConfig.apiBaseUrl`. */

export const STUDY_SETS_PATH = '/study-sets';
export const STUDY_POPULAR_TAGS_PATH = '/study-tags/popular';

export function studySetPath(setId: string): string {
  return `${STUDY_SETS_PATH}/${setId}`;
}

export function studySetItemsPath(setId: string): string {
  return `${studySetPath(setId)}/items`;
}

export function studySetDuplicatePath(setId: string): string {
  return `${studySetPath(setId)}/duplicate`;
}

export function studySetReportPath(setId: string): string {
  return `${studySetPath(setId)}/report`;
}

/** `GET /workspaces/:id` trần — đọc `myRole`/`status`. Khai ĐỘC LẬP với `workspaces/api` (không import chéo feature). */
export function studyWorkspacePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}`;
}

/** `POST /study-sets/:id/hide` — OWNER/ADMIN nhóm ẩn bộ WORKSPACE (be `study.routes.ts`, thân `{ reason }` 10–500 ký tự). */
export function studySetHidePath(setId: string): string {
  return `${studySetPath(setId)}/hide`;
}

/** `POST /study-sets/:id/unhide` — khôi phục bộ đã ẩn. ⚠️ Cũng POST (không phải DELETE) và cũng BẮT BUỘC `{ reason }`. */
export function studySetUnhidePath(setId: string): string {
  return `${studySetPath(setId)}/unhide`;
}
