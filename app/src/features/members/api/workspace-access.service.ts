import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type { WorkspaceAccessSlice } from './invitations.types';

/**
 * Lát `GET /workspaces/:id` mà các màn mời/duyệt/khách cần (vai trò của MÌNH,
 * `canInvite`, chính sách mời khách). Khai ĐỘC LẬP với `workspaces` (không import
 * chéo feature) và dùng CHUNG khoá cache `['workspaces','detail',wsId]` — cùng
 * mẫu `useCanCreateChannel` của `channels`: hai bên chia sẻ MỘT response thật.
 */
export const workspaceAccessService = {
  async get(workspaceId: string): Promise<WorkspaceAccessSlice> {
    const response = await apiClient.get<WorkspaceAccessSlice>(`/workspaces/${workspaceId}`);
    return unwrapData<WorkspaceAccessSlice>(response);
  },
};
