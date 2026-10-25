/**
 * Khoá React Query của chi tiết thẻ (app.md p3-03 §4). Tiền tố `['tasks', …]` để logout dọn
 * bằng MỘT `removeQueries(['tasks'])`; khoá `mentionables` gắn với BẢNG chứ không phải thẻ
 * (danh sách thành viên dùng chung cho mọi thẻ của bảng).
 */
export const taskKeys = {
  all: ['tasks'] as const,
  detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
  activity: (taskId: string) => ['tasks', 'activity', taskId] as const,
  comments: (taskId: string) => ['tasks', 'comments', taskId] as const,
  attachments: (taskId: string) => ['tasks', 'attachments', taskId] as const,
  /** p4-04: phụ thuộc của thẻ (`TaskDependenciesDto`). */
  dependencies: (taskId: string) => ['tasks', 'dependencies', taskId] as const,
  /** p3-03 P1: người theo dõi thẻ + trạng thái theo dõi của TÔI (`me`). */
  watchers: (taskId: string) => ['tasks', 'watchers', taskId] as const,
  mentionables: (boardId: string, q: string) => ['boards', 'mentionables', boardId, q] as const,
};
