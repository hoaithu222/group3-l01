import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { MY_WORKSPACES_PATH, workspaceMembersPath } from './meetings.api';
import type { WorkspaceMemberOption, WorkspaceOption } from './meetings.types';

/**
 * Dữ liệu TRA CỨU cho form/bộ lọc lịch (tách khỏi `meetings.service.ts` cho gọn trần 150 dòng). Gọi THẲNG endpoint bằng service
 * của feature này — `meetings` không import `channels`/`members`/`workspaces` (`feature-structure.md`).
 */
export const meetingsLookupService = {
  /** Thành viên ACTIVE của nhóm (tìm người tham dự) — cùng mẫu `channelsService.searchWorkspaceMembers`. */
  async searchWorkspaceMembers(workspaceId: string, q?: string): Promise<WorkspaceMemberOption[]> {
    const response = await apiClient.get<{ data: WorkspaceMemberOption[] }>(
      workspaceMembersPath(workspaceId),
      {
        params: { limit: 50, page: 1, q: q || undefined, status: 'ACTIVE' },
        skipErrorToast: true,
      },
    );
    return response.data.data;
  },

  /** Nhóm của tôi (chọn nhóm khi tạo họp từ tab Lịch). Chỉ nhóm ACTIVE mình là thành viên chính thức (không PENDING/GUEST). */
  async listMyWorkspaces(): Promise<WorkspaceOption[]> {
    const response = await apiClient.get<WorkspaceOption[]>(MY_WORKSPACES_PATH, {
      params: { status: 'ACTIVE' },
      skipErrorToast: true,
    });
    return unwrapData<(WorkspaceOption & { status?: string })[]>(response)
      .filter((w) => w.status !== 'PENDING' && w.myRole !== 'GUEST')
      .map((w) => ({ avatarUrl: w.avatarUrl, id: w.id, myRole: w.myRole, name: w.name }));
  },
};
