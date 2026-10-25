import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  channelGrantPath,
  channelGrantsPath,
  channelMemberAccessPath,
  channelRoleGrantPath,
  channelRoleGrantsPath,
  workspaceMembersPath,
} from './channels.api';
import type {
  AddGrantsPayload,
  AddGrantsResult,
  ChannelGrant,
  ChannelGrantsSnapshot,
  ChannelMemberAccess,
  PatchGrantPayload,
  RoleGrant,
  RoleRef,
} from './channels.types';
import { normalizeGrants, type RawGrantRow } from './grants.normalize';

/**
 * `/channels/:channelId/grants*` (be.md p1-03 §4 + p3-04 §4) — tách khỏi `channels.service.ts`
 * theo đúng cấu trúc app.md §2 (`api/grants.service.ts` riêng), vì grant là một lát nghiệp vụ
 * RIÊNG (chỉ kênh PRIVATE, chỉ MANAGER) dù cùng module.
 */
export const grantsService = {
  /** Người được cấp TRỰC TIẾP + vai trò được cấp, đã chuẩn hoá từ dạng response cũ/mới (`grants.normalize.ts`). */
  async list(channelId: string): Promise<ChannelGrantsSnapshot> {
    const response = await apiClient.get<RawGrantRow[]>(channelGrantsPath(channelId));
    return normalizeGrants(unwrapData<RawGrantRow[]>(response));
  },

  /** Idempotent phía BE — gọi lại với cùng `userIds` không tạo trùng (be.md §5.4). */
  async add(channelId: string, payload: AddGrantsPayload): Promise<AddGrantsResult> {
    const response = await apiClient.post<AddGrantsResult>(channelGrantsPath(channelId), payload);
    return unwrapData<AddGrantsResult>(response);
  },

  async patch(channelId: string, userId: string, payload: PatchGrantPayload): Promise<ChannelGrant> {
    const response = await apiClient.patch<ChannelGrant>(channelGrantPath(channelId, userId), payload);
    return unwrapData<ChannelGrant>(response);
  },

  /** Cũng dùng cho "tự rời kênh riêng tư" — be.md §4: chính mình hoặc `manage`. */
  async revoke(channelId: string, userId: string): Promise<void> {
    await apiClient.delete(channelGrantPath(channelId, userId));
  },

  /** Cấp cả VAI TRÒ (p3-04, chỉ kênh PRIVATE, chỉ MANAGER) — idempotent; 409 khi kênh public. */
  async addRole(channelId: string, roleRef: RoleRef): Promise<RoleGrant> {
    const response = await apiClient.post<RoleGrant>(channelRoleGrantsPath(channelId), { roleRef });
    return unwrapData<RoleGrant>(response);
  },

  /** Gỡ cả vai trò — người chỉ còn quyền qua vai trò này mất quyền ngay (BE `revokeScope`). */
  async removeRole(channelId: string, roleRef: RoleRef): Promise<void> {
    await apiClient.delete(channelRoleGrantPath(channelId, roleRef));
  },

  /** Nguồn quyền HIỆU LỰC của một người (PR-05). `skipErrorToast`: lỗi này chỉ làm mất phần giải thích, không đáng toast. */
  async access(channelId: string, userId: string): Promise<ChannelMemberAccess> {
    const response = await apiClient.get<ChannelMemberAccess>(channelMemberAccessPath(channelId, userId), {
      skipErrorToast: true,
    });
    return unwrapData<ChannelMemberAccess>(response);
  },

  /**
   * Số thành viên ACTIVE có đúng MỘT vai trò — cho lời xem trước "Khoảng N người sẽ xem
   * được" (be.md không có endpoint đếm riêng, nên đọc `meta.total` của danh sách thành viên
   * với `limit=1`). Đọc thẳng `response.data` (không qua `unwrapData`) để giữ `meta`.
   */
  async countRoleMembers(workspaceId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER'): Promise<number> {
    const response = await apiClient.get<{ meta: { total: number } }>(workspaceMembersPath(workspaceId), {
      params: { role, status: 'ACTIVE', page: 1, limit: 1 },
      skipErrorToast: true,
    });
    return response.data.meta.total;
  },
};
