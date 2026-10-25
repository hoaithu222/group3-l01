import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { inviteAcceptPath, invitePreviewPath, workspaceInvitePath, workspaceInvitesPath } from './invites.api';
import type {
  AcceptInvitePayload,
  AcceptInviteResult,
  CreateInvitePayload,
  CreateInviteResult,
  InviteListPage,
  InvitePreview,
  InviteRow,
} from './invites.types';

export const invitesService = {
  /** Đọc thẳng `response.data` (không qua `unwrapData`) để giữ được `meta` cursor. */
  async list(workspaceId: string, cursor: string | undefined, limit = 20): Promise<InviteListPage> {
    const response = await apiClient.get<{ data: InviteRow[]; meta: InviteListPage['meta'] }>(
      workspaceInvitesPath(workspaceId),
      { params: { cursor, limit } },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  async create(workspaceId: string, payload: CreateInvitePayload): Promise<CreateInviteResult> {
    const response = await apiClient.post<CreateInviteResult>(
      workspaceInvitesPath(workspaceId),
      payload,
    );
    return unwrapData<CreateInviteResult>(response);
  },

  async revoke(workspaceId: string, inviteId: string): Promise<void> {
    await apiClient.delete(workspaceInvitePath(workspaceId, inviteId));
  },

  /** `optionalAuth` phía BE — gọi được cả khi chưa đăng nhập. */
  async preview(token: string): Promise<InvitePreview> {
    const response = await apiClient.get<InvitePreview>(invitePreviewPath(token), {
      skipErrorToast: true,
    });
    return unwrapData<InvitePreview>(response);
  },

  /**
   * `requestMessage` chỉ vào body khi CÓ chữ (đã cắt khoảng trắng) — BE coi rỗng là "không gửi", và client cũ không body vẫn chạy.
   * Client KHÔNG biết trước nhóm có duyệt hay không (preview không trả `joinPolicy`): cứ gửi nếu người dùng đã nhập, BE tự bỏ qua ở nhóm mở.
   */
  async accept(token: string, payload?: AcceptInvitePayload): Promise<AcceptInviteResult> {
    const requestMessage = payload?.requestMessage?.trim();
    const response = await apiClient.post<AcceptInviteResult>(
      inviteAcceptPath(token),
      requestMessage ? { requestMessage } : undefined,
      { skipErrorToast: true },
    );
    return unwrapData<AcceptInviteResult>(response);
  },
};
