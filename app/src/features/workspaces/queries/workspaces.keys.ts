import type { WorkspaceListStatus } from '../api';

export const workspaceKeys = {
  all: ['workspaces'] as const,
  /**
   * Tiền tố MỌI danh sách nhóm (mọi `status`). ⚠️ Làm mới/vá danh sách thì đi qua đây, KHÔNG qua `list('ACTIVE')` (bỏ sót
   * tab khác) hay `all` (vá kiểu mảng lên cả `detail`/`overview` là object ⇒ `TypeError`).
   */
  lists: () => [...workspaceKeys.all, 'list'] as const,
  list: (status: WorkspaceListStatus) => [...workspaceKeys.all, 'list', status] as const,
  detail: (workspaceId: string) => [...workspaceKeys.all, 'detail', workspaceId] as const,
  overview: (workspaceId: string) => [...workspaceKeys.all, 'overview', workspaceId] as const,
  /** Bộ chọn người nhận quyền chủ nhóm — `q` (đã trim) ảnh hưởng kết quả nên nằm trong khoá. */
  transferCandidates: (workspaceId: string, q: string) =>
    [...workspaceKeys.all, 'transfer-candidates', workspaceId, q] as const,
};
