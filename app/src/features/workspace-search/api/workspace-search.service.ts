import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  channelJoinPath,
  CONVERSATIONS_PATH,
  workspaceChannelsPath,
  workspaceMembersPath,
  workspacePath,
  workspaceSearchPath,
} from './workspace-search.api';
import type {
  ChannelHit,
  FileHit,
  MeetingHit,
  MessageHit,
  PersonHit,
  SearchAuthorOption,
  SearchRow,
  SearchScopeOption,
  SearchWorkspaceHead,
  WorkspaceSearchMeta,
  WorkspaceSearchPage,
  WorkspaceSearchRequest,
  WorkspaceSearchType,
} from './workspace-search.types';

/** Gắn loại + khoá ổn định cho từng dòng — `renderItem` rẽ nhánh theo `type`, không ép kiểu ở tầng màn hình. */
function toRows(type: WorkspaceSearchType, data: unknown[]): SearchRow[] {
  switch (type) {
    case 'messages':
      return (data as MessageHit[]).map((hit) => ({ type, key: hit.messageId, hit }));
    case 'files':
      return (data as FileHit[]).map((hit) => ({
        type,
        // Một tin có thể kèm nhiều tệp: `assetId` một mình có thể trùng giữa hai nguồn, nên ghép với id nguồn.
        key: `${hit.source.messageId ?? hit.source.resourceId ?? ''}:${hit.assetId}`,
        hit,
      }));
    case 'channels':
      return (data as ChannelHit[]).map((hit) => ({ type, key: hit.channelId, hit }));
    case 'people':
      return (data as PersonHit[]).map((hit) => ({ type, key: hit.userId, hit }));
    case 'meetings':
      return (data as MeetingHit[]).map((hit) => ({ type, key: hit.meetingId, hit }));
  }
}

interface MemberRow {
  userId: string;
  name: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface ChannelRow {
  id: string;
  name: string;
  visibility: 'PUBLIC' | 'PRIVATE';
}

interface ConversationRow {
  id: string;
  kind: 'DIRECT' | 'GROUP';
  title: string | null;
}

/**
 * ⛔ Danh sách cursor ĐỌC `response.data.data` + `response.data.meta` trực tiếp, KHÔNG `unwrapData`: BE trả
 * `{ success, data: [...], meta }` ở gốc thân phản hồi, `unwrapData` bóc `.data` và VỨT `meta` — `getNextPageParam`
 * sau đó đọc `meta.hasMore` trên một mảng trần và nổ (cùng bẫy `chatService.list`).
 *
 * Tìm dùng `skipErrorToast`: lỗi (`SRCH_*`, 404, 429) hiện TẠI CHỖ trong màn, không toast trùng.
 */
export const workspaceSearchService = {
  async search(workspaceId: string, params: WorkspaceSearchRequest): Promise<WorkspaceSearchPage> {
    const response = await apiClient.get<{ data: unknown[]; meta: WorkspaceSearchMeta }>(
      workspaceSearchPath(workspaceId),
      { params, skipErrorToast: true },
    );
    return { data: toRows(params.type, response.data.data), meta: response.data.meta };
  },

  /** Người gửi cho bộ lọc: thành viên ACTIVE, BE lọc theo `q` không dấu. Khách bị 404 ở endpoint này nên màn ẩn bộ lọc. */
  async listAuthors(workspaceId: string, q: string): Promise<SearchAuthorOption[]> {
    const response = await apiClient.get<{ data: MemberRow[] }>(workspaceMembersPath(workspaceId), {
      params: { status: 'ACTIVE', q: q || undefined, sort: 'name', page: 1, limit: 50 },
      skipErrorToast: true,
    });
    return response.data.data.map((row) => ({
      userId: row.userId,
      name: row.displayName?.trim() || row.name,
      avatarUrl: row.avatarUrl ?? null,
    }));
  },

  /** Phạm vi cho bộ lọc: kênh (đã vào + công khai khám phá được) và nhóm chat; BE vẫn kiểm lại (`SRCH_102`). */
  async listScopes(workspaceId: string): Promise<SearchScopeOption[]> {
    const [channels, conversations] = await Promise.all([
      apiClient.get<{ joined: ChannelRow[]; discoverable: ChannelRow[] }>(
        workspaceChannelsPath(workspaceId),
        {
          params: { include: 'all', status: 'ACTIVE' },
          skipErrorToast: true,
        },
      ),
      apiClient.get<{ data: ConversationRow[] }>(CONVERSATIONS_PATH, {
        params: { filter: 'group', workspaceId, limit: 50 },
        skipErrorToast: true,
      }),
    ]);
    const { joined, discoverable } = unwrapData<{
      joined: ChannelRow[];
      discoverable: ChannelRow[];
    }>(channels);
    const channelOptions = [...joined, ...discoverable].map((row): SearchScopeOption => ({
      type: 'CHANNEL',
      id: row.id,
      name: row.name,
      isPrivate: row.visibility === 'PRIVATE',
    }));
    const groupOptions = conversations.data.data
      .filter((row) => row.kind === 'GROUP')
      .map((row): SearchScopeOption => ({
        type: 'CONVERSATION',
        id: row.id,
        name: row.title?.trim() || 'Nhóm chat',
        isPrivate: true,
      }));
    return [...channelOptions, ...groupOptions];
  },

  /** Tham gia kênh công khai chưa vào. Lỗi (đầy kênh, kênh đã lưu trữ…) hiện bằng toast ở nơi gọi. */
  async joinChannel(channelId: string): Promise<void> {
    await apiClient.post(channelJoinPath(channelId), undefined, { skipErrorToast: true });
  },

  /**
   * Đầu nhóm (vai trò của mình + trạng thái) — cùng phản hồi `GET /workspaces/:id` mà `workspaces` dùng.
   * ⛔ Trả NGUYÊN phản hồi (chỉ khai kiểu hẹp), KHÔNG được chọn riêng `myRole`: khoá cache `workspaceDetailKey` dùng chung
   * với `useWorkspace()`, mà bên đó đọc nó như một `WorkspaceDetail` đầy đủ — cất một chuỗi vào đó là màn khác nổ.
   */
  async getWorkspaceHead(workspaceId: string): Promise<SearchWorkspaceHead> {
    const response = await apiClient.get<SearchWorkspaceHead>(workspacePath(workspaceId), {
      skipErrorToast: true,
    });
    return unwrapData<SearchWorkspaceHead>(response);
  },
};
