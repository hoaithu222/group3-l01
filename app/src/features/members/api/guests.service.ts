import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { guestMemberPath, workspaceChannelsForGuestPath } from './invitations.api';
import type { GuestChannelOption, UpdateGuestPayload } from './invitations.types';
import type { MemberRow } from './members.types';

/** Quản lý KHÁCH (OWNER/ADMIN) — be.md p3-04 §4. */
export const guestsService = {
  /** 409 `RES_003` khi `expectedVersion` lệch — màn tải lại thẻ. */
  async update(workspaceId: string, userId: string, payload: UpdateGuestPayload): Promise<MemberRow> {
    const response = await apiClient.patch<MemberRow>(guestMemberPath(workspaceId, userId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<MemberRow>(response);
  },

  /**
   * Kênh có thể chỉ định cho khách: kênh CÔNG KHAI + kênh riêng tư mình thấy
   * (`joined`). ⚠️ Danh sách kênh (p1-03) KHÔNG trả cờ "mình có quản lý kênh
   * riêng này không" — BE mới là nơi quyết (`CH_009`); màn báo lỗi khi chọn sai
   * thay vì đoán quyền ở client.
   */
  async listChannelOptions(workspaceId: string): Promise<GuestChannelOption[]> {
    const response = await apiClient.get<{
      joined: GuestChannelOption[];
      discoverable: GuestChannelOption[];
    }>(workspaceChannelsForGuestPath(workspaceId), { params: { include: 'all', status: 'ACTIVE' } });
    const { joined, discoverable } = unwrapData<{
      joined: GuestChannelOption[];
      discoverable: GuestChannelOption[];
    }>(response);

    const byId = new Map<string, GuestChannelOption>();
    for (const channel of [...joined, ...discoverable]) {
      byId.set(channel.id, { id: channel.id, name: channel.name, visibility: channel.visibility });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },
};
