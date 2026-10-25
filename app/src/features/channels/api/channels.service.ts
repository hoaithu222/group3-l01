import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  channelArchivePath,
  channelJoinPath,
  channelLeavePath,
  channelMePath,
  channelMembersPath,
  channelPath,
  channelRestorePath,
  workspaceChannelsPath,
  workspaceChannelsSearchPath,
  workspaceMembersPath,
  workspacePath,
} from './channels.api';
import type {
  ArchiveChannelPayload,
  ChannelDetail,
  ChannelListItem,
  ChannelListResponse,
  ChannelMePayload,
  ChannelMemberListPage,
  ChannelMeResult,
  CreateChannelPayload,
  UpdateChannelPayload,
  WorkspaceChannelPermissions,
  WorkspaceMemberOption,
} from './channels.types';

export const channelsService = {
  /** `include=all` mặc định — trả CẢ `joined` lẫn `discoverable` trong một lượt (app.md §4). */
  async list(workspaceId: string): Promise<ChannelListResponse> {
    const response = await apiClient.get<ChannelListResponse>(workspaceChannelsPath(workspaceId), {
      params: { include: 'all', status: 'ACTIVE' },
    });
    return unwrapData<ChannelListResponse>(response);
  },

  async search(workspaceId: string, q: string): Promise<ChannelListItem[]> {
    const response = await apiClient.get<ChannelListItem[]>(workspaceChannelsSearchPath(workspaceId), {
      params: { q },
    });
    return unwrapData<ChannelListItem[]>(response);
  },

  /** `idempotencyKey` bắt buộc — sinh lúc mở `CreateChannelScreen` (app.md §3). */
  async create(
    workspaceId: string,
    payload: CreateChannelPayload,
    idempotencyKey: string,
  ): Promise<ChannelDetail> {
    const response = await apiClient.post<ChannelDetail>(workspaceChannelsPath(workspaceId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return unwrapData<ChannelDetail>(response);
  },

  async get(channelId: string): Promise<ChannelDetail> {
    const response = await apiClient.get<ChannelDetail>(channelPath(channelId));
    return unwrapData<ChannelDetail>(response);
  },

  async update(channelId: string, payload: UpdateChannelPayload): Promise<ChannelDetail> {
    const response = await apiClient.patch<ChannelDetail>(channelPath(channelId), payload);
    return unwrapData<ChannelDetail>(response);
  },

  async archive(channelId: string, payload: ArchiveChannelPayload): Promise<ChannelDetail> {
    const response = await apiClient.post<ChannelDetail>(channelArchivePath(channelId), payload);
    return unwrapData<ChannelDetail>(response);
  },

  async restore(channelId: string, expectedVersion: number): Promise<ChannelDetail> {
    const response = await apiClient.post<ChannelDetail>(channelRestorePath(channelId), {
      expectedVersion,
    });
    return unwrapData<ChannelDetail>(response);
  },

  async join(channelId: string): Promise<ChannelListItem> {
    const response = await apiClient.post<ChannelListItem>(channelJoinPath(channelId));
    return unwrapData<ChannelListItem>(response);
  },

  async leave(channelId: string): Promise<void> {
    await apiClient.post(channelLeavePath(channelId));
  },

  async updateMe(channelId: string, payload: ChannelMePayload): Promise<ChannelMeResult> {
    const response = await apiClient.patch<ChannelMeResult>(channelMePath(channelId), payload);
    return unwrapData<ChannelMeResult>(response);
  },

  async members(channelId: string, page: number, q?: string, limit = 20): Promise<ChannelMemberListPage> {
    const response = await apiClient.get<{ data: ChannelMemberListPage['items']; meta: ChannelMemberListPage['meta'] }>(
      channelMembersPath(channelId),
      { params: { page, limit, q } },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  /**
   * Thành viên NHÓM đang ACTIVE — dùng cho bước "Đối tượng" của wizard tạo
   * kênh và `AddGrantSheet` (app.md §2 "chọn thành viên (tìm)"). Gọi thẳng
   * endpoint của `members` (p1-02) — không import service của feature đó
   * (`feature-structure.md`).
   */
  async searchWorkspaceMembers(workspaceId: string, q?: string): Promise<WorkspaceMemberOption[]> {
    const response = await apiClient.get<{ data: WorkspaceMemberOption[] }>(workspaceMembersPath(workspaceId), {
      params: { status: 'ACTIVE', q, page: 1, limit: 50 },
    });
    return response.data.data;
  },

  /**
   * Lát `myPermissions.canCreateChannel` của WORKSPACE (không phải kênh) —
   * `ChannelListScreen` cần để quyết định hiện nút "Tạo kênh" theo be.md p1-01
   * §4. Cùng endpoint `GET /workspaces/:id` mà `workspaces.service.ts` gọi;
   * `useCanCreateChannel` (`channels.queries.ts`) cố ý dùng CHUNG khoá cache
   * `['workspaces','detail',wsId]` với `useWorkspace()` của feature đó — an
   * toàn vì cùng URL, cùng response THẬT (`WorkspaceDetail` đầy đủ), chỉ khai
   * kiểu HẸP hơn ở đây cho phần này thật sự đọc tới.
   */
  async workspacePermissions(workspaceId: string): Promise<WorkspaceChannelPermissions> {
    const response = await apiClient.get<WorkspaceChannelPermissions>(workspacePath(workspaceId));
    return unwrapData<WorkspaceChannelPermissions>(response);
  },
};
