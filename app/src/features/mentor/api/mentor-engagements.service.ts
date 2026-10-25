import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  mentorEngagementActionPath,
  MY_MENTOR_ENGAGEMENTS_PATH,
  MY_WORKSPACES_PATH,
  workspaceChannelsPath,
  workspaceMembersPath,
  workspaceMentorEngagementsPath,
} from './mentor.api';
import type {
  ManagedWorkspace,
  MentorChannelOption,
  MentorEngagement,
  MentorEngagementStatus,
  MentorMemberOption,
} from './mentor.types';

interface RawChannel {
  id: string;
  isDefault: boolean;
  name: string;
  status: string;
  visibility: 'PRIVATE' | 'PUBLIC';
}

interface RawWorkspace {
  id: string;
  myRole: string;
  name: string;
  status: string;
}

/** Đợt cố vấn + dữ liệu phụ đọc từ endpoint phân hệ khác (kênh, thành viên, nhóm của tôi). */
export const mentorEngagementsService = {
  async workspaceEngagements(
    wsId: string,
    status?: MentorEngagementStatus,
  ): Promise<MentorEngagement[]> {
    const response = await apiClient.get(workspaceMentorEngagementsPath(wsId), {
      params: { status },
      skipErrorToast: true,
    });
    return unwrapData<MentorEngagement[]>(response);
  },

  async myEngagements(): Promise<MentorEngagement[]> {
    return unwrapData<MentorEngagement[]>(
      await apiClient.get(MY_MENTOR_ENGAGEMENTS_PATH, { params: { status: 'ACTIVE' } }),
    );
  },

  /** Tổng ≤ 90 ngày — vượt → 400 `MENTOR_007` (màn hiện lỗi trong tấm). */
  async extend(
    engagementId: string,
    addDays: number,
    expectedVersion: number,
  ): Promise<MentorEngagement> {
    const response = await apiClient.post(
      mentorEngagementActionPath(engagementId, 'extend'),
      { addDays, expectedVersion },
      { skipErrorToast: true },
    );
    return unwrapData<MentorEngagement>(response);
  },

  async end(engagementId: string, reason?: string): Promise<MentorEngagement> {
    const response = await apiClient.post(mentorEngagementActionPath(engagementId, 'end'), {
      reason: reason || undefined,
    });
    return unwrapData<MentorEngagement>(response);
  },

  /** Kênh ĐANG HOẠT ĐỘNG mình thấy được (`joined` + `discoverable`) — BE kiểm lại quyền quản lý kênh riêng tư (`MENTOR_008`). */
  async channelOptions(wsId: string): Promise<MentorChannelOption[]> {
    const response = await apiClient.get(workspaceChannelsPath(wsId), {
      params: { include: 'all', status: 'ACTIVE' },
    });
    const data = unwrapData<{ discoverable?: RawChannel[]; joined?: RawChannel[] }>(response);
    const all = [...(data.joined ?? []), ...(data.discoverable ?? [])].filter(
      (c) => c.status === 'ACTIVE',
    );
    const seen = new Set<string>();
    return all
      .filter((c) => !seen.has(c.id) && seen.add(c.id))
      .map((c) => ({ id: c.id, isDefault: c.isDefault, name: c.name, visibility: c.visibility }));
  },

  /** Thành viên (không phải khách) để kèm vào nhóm chat cố vấn — tối đa 100 (trần `listMembersQuerySchema`). */
  async memberOptions(wsId: string): Promise<MentorMemberOption[]> {
    const response = await apiClient.get<{
      data: { isMe: boolean; name: string; role: string; userId: string }[];
    }>(workspaceMembersPath(wsId), {
      params: { limit: 100, page: 1, sort: 'name', status: 'ACTIVE' },
    });
    return response.data.data
      .filter((m) => !m.isMe && m.role !== 'GUEST')
      .map((m) => ({ name: m.name, role: m.role, userId: m.userId }));
  },

  /** Nhóm mình là OWNER/ADMIN — lối vào "Quản lý bài của nhóm" từ bảng tin (không cần sửa màn nhóm). */
  async managedWorkspaces(): Promise<ManagedWorkspace[]> {
    const rows = unwrapData<RawWorkspace[]>(
      await apiClient.get(MY_WORKSPACES_PATH, { params: { status: 'ACTIVE' } }),
    );
    return rows
      .filter((w) => w.status === 'ACTIVE' && (w.myRole === 'OWNER' || w.myRole === 'ADMIN'))
      .map((w) => ({ id: w.id, name: w.name }));
  },
};
