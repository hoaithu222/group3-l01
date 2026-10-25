/**
 * Public API của phân hệ `workspace` cho code NGOÀI phân hệ (cùng mẫu `@/features/audit-log`): phần mà widget dùng
 * chung `shared/widgets/workspace-picker` cần, và `useAdminWorkspace` (phân hệ `meeting` đọc tên workspace của bộ lọc `?workspaceId=`). Trang/tab của phân hệ tự import theo đường dẫn tương đối, không qua đây.
 */
export { useAdminWorkspace, useWorkspaceOptionSearch } from './service/workspace.queries';
export type { WorkspaceOption } from './types/workspace.types';
