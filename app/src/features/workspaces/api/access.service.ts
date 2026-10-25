import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type { UpdateWorkspaceSettingsPayload, WorkspaceSettingsDto } from './access.types';

/**
 * `PATCH /workspaces/:id/settings` (OWNER) + `POST /workspaces/:id/join-request/cancel`
 * (chính người đang chờ) — be.md p3-04 §4. Tách khỏi `workspaces.service.ts` (đang
 * được chỉnh cho p1-01) để lát p3-04 nằm gọn một chỗ.
 *
 * `skipErrorToast`: 409 `RES_003` và các lỗi khác hiện NGAY TRONG màn (giữ nguyên
 * giá trị đang sửa), không toast tự tắt.
 */
export const workspaceAccessApi = {
  async updateSettings(workspaceId: string, payload: UpdateWorkspaceSettingsPayload): Promise<WorkspaceSettingsDto> {
    const response = await apiClient.patch<WorkspaceSettingsDto>(`/workspaces/${workspaceId}/settings`, payload, {
      skipErrorToast: true,
    });
    return unwrapData<WorkspaceSettingsDto>(response);
  },

  /** `204` — huỷ yêu cầu tham gia của CHÍNH MÌNH. */
  async cancelJoinRequest(workspaceId: string): Promise<void> {
    await apiClient.post(`/workspaces/${workspaceId}/join-request/cancel`, undefined, { skipErrorToast: true });
  },
};
