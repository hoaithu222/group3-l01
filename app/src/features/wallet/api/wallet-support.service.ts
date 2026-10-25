import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  CONVERSATIONS_PATH,
  workspaceChannelsPath,
  workspaceDetailPath,
  workspaceMembersPath,
} from './wallet.api';
import type { ReminderTargets, WalletMember, WalletWorkspaceAccess } from './wallet.types';

interface RawChannel {
  id: string;
  name: string;
  type: string;
}

interface RawConversation {
  id: string;
  kind: string;
  status: string;
  title: string | null;
}

/**
 * Dữ liệu của module KHÁC mà ví phải đọc — gọi thẳng endpoint, không import
 * service của feature đó (`feature-structure.md`: không import chéo feature).
 * Cùng mẫu `boardsService.workspaceAccess`/`searchWorkspaceMembers`.
 */
export const walletSupportService = {
  /** Chung khoá cache `['workspaces','detail',wsId]` với feature `workspaces` — MỘT response thật. */
  async workspaceAccess(workspaceId: string): Promise<WalletWorkspaceAccess> {
    const response = await apiClient.get<WalletWorkspaceAccess>(workspaceDetailPath(workspaceId));
    return unwrapData<WalletWorkspaceAccess>(response);
  },

  /**
   * Thành viên ACTIVE — chỉ để hiện TÊN. Đọc `response.data.data` vì endpoint kèm
   * `meta` phân trang. 100 là trần `limit` của BE; ví tối đa 50 người tham gia
   * mỗi khoản nên một trang là đủ, người rời nhóm hiện là "Người đã rời nhóm".
   */
  async members(workspaceId: string): Promise<WalletMember[]> {
    const response = await apiClient.get<{ data: WalletMember[] }>(
      workspaceMembersPath(workspaceId),
      {
        params: { status: 'ACTIVE', page: 1, limit: 100 },
      },
    );
    return response.data.data;
  },

  /** Nơi có thể đăng tin nhắc nợ: nhóm chat GROUP còn hoạt động + kênh TEXT của nhóm. */
  async reminderTargets(workspaceId: string): Promise<ReminderTargets> {
    const [conversations, channels] = await Promise.all([
      apiClient.get<{ data: RawConversation[] }>(CONVERSATIONS_PATH, {
        params: { filter: 'group', workspaceId, limit: 50 },
      }),
      apiClient.get<{ joined: RawChannel[]; discoverable: RawChannel[] }>(
        workspaceChannelsPath(workspaceId),
        {
          params: { include: 'all', status: 'ACTIVE' },
        },
      ),
    ]);
    const channelLists = unwrapData<{ joined: RawChannel[]; discoverable: RawChannel[] }>(channels);
    return {
      conversations: conversations.data.data
        .filter((item) => item.kind === 'GROUP' && item.status === 'ACTIVE')
        .map((item) => ({ id: item.id, label: item.title?.trim() || 'Nhóm chat' })),
      channels: [...channelLists.joined, ...channelLists.discoverable]
        .filter((item) => item.type === 'TEXT')
        .map((item) => ({ id: item.id, label: `# ${item.name}` })),
    };
  },
};
