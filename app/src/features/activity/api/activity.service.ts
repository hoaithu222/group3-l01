import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

/** Một nhóm làm việc trong chip lọc. */
export interface ActivityWorkspaceOption {
  id: string;
  name: string;
}

/**
 * Danh sách nhóm làm việc cho chip lọc hộp thư. Gọi THẲNG `GET /workspaces` (p1-01) — `activity` không được import
 * feature `workspaces` (`feature-structure.md`), cùng mẫu `discoveryService.listWorkspaces`.
 */
export const activityService = {
  async listWorkspaces(): Promise<ActivityWorkspaceOption[]> {
    const response = await apiClient.get<ActivityWorkspaceOption[]>('/workspaces', {
      params: { status: 'ACTIVE' },
      skipErrorToast: true,
    });
    return unwrapData<ActivityWorkspaceOption[]>(response).map(({ id, name }) => ({ id, name }));
  },
};
