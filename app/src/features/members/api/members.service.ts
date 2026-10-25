import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';
import type { SkillBadge } from '@/shared/career';

import {
  memberBanPath,
  memberPath,
  memberRemovePath,
  membersPath,
  memberSkillsPath,
  memberUnbanPath,
  workspaceWellbeingIndicatorsPath,
} from './members.api';
import type {
  ListMembersFilter,
  MemberCard,
  MemberListPage,
  MemberRow,
  ModerateMemberPayload,
  PatchMemberPayload,
  WorkspaceWellbeingIndicator,
} from './members.types';

const WELLBEING_LEVELS: readonly string[] = ['LOW', 'MEDIUM', 'HIGH'];

function isWellbeingIndicator(raw: unknown): raw is WorkspaceWellbeingIndicator {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.userId === 'string' && typeof r.date === 'string' && typeof r.level === 'string' && WELLBEING_LEVELS.includes(r.level);
}

export const membersService = {
  /**
   * `unwrapData` bóc mỗi `data` — ở đây ta cần CẢ `meta` (phân trang) nên đọc
   * thẳng `response.data` thay vì qua nó (xem chú thích `unwrapData`).
   */
  async list(
    workspaceId: string,
    filter: ListMembersFilter,
    page: number,
    limit = 20,
  ): Promise<MemberListPage> {
    const response = await apiClient.get<{ data: MemberRow[]; meta: MemberListPage['meta'] }>(
      membersPath(workspaceId),
      { params: { ...filter, page, limit, sort: 'role' } },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  async card(workspaceId: string, userId: string): Promise<MemberCard> {
    const response = await apiClient.get<MemberCard>(memberPath(workspaceId, userId));
    return unwrapData<MemberCard>(response);
  },

  /**
   * Huy hiệu kỹ năng xác thực hiện trên thẻ thành viên (p6-06 §1: tối đa 3). 404/403 là trạng thái BÌNH THƯỜNG ("người này không chia sẻ huy hiệu")
   * — nơi gọi ẩn dòng huy hiệu, không toast: `skipErrorToast`.
   */
  async skillBadges(userId: string): Promise<SkillBadge[]> {
    const response = await apiClient.get<SkillBadge[]>(memberSkillsPath(userId), { skipErrorToast: true });
    const data = unwrapData<SkillBadge[]>(response);
    return Array.isArray(data) ? data : [];
  },

  async patch(
    workspaceId: string,
    userId: string,
    payload: PatchMemberPayload,
  ): Promise<MemberRow> {
    const response = await apiClient.patch<MemberRow>(memberPath(workspaceId, userId), payload);
    return unwrapData<MemberRow>(response);
  },

  async remove(workspaceId: string, userId: string, payload: ModerateMemberPayload): Promise<void> {
    await apiClient.post(memberRemovePath(workspaceId, userId), payload);
  },

  async ban(workspaceId: string, userId: string, payload: ModerateMemberPayload): Promise<void> {
    await apiClient.post(memberBanPath(workspaceId, userId), payload);
  },

  async unban(workspaceId: string, userId: string, payload: ModerateMemberPayload): Promise<void> {
    await apiClient.post(memberUnbanPath(workspaceId, userId), payload);
  },

  /**
   * p7-03 (P1) — chỉ báo sức khoẻ học tập của nhóm; BE tự chặn theo `requireWorkspaceRole('ADMIN')` (403/404 nếu không đủ quyền) và chỉ trả
   * người đã tự chia sẻ + còn ACTIVE. Lỗi (đổi quyền giữa chừng, cờ `burnout` tắt, mất mạng…) im lặng trả rỗng — chấm cam là tiện ích phụ,
   * không được làm hỏng màn danh sách thành viên.
   */
  async wellbeingIndicators(workspaceId: string): Promise<WorkspaceWellbeingIndicator[]> {
    try {
      const response = await apiClient.get<unknown>(workspaceWellbeingIndicatorsPath(workspaceId), {
        skipErrorToast: true,
      });
      const data = unwrapData<unknown>(response);
      return Array.isArray(data) ? data.filter(isWellbeingIndicator) : [];
    } catch {
      return [];
    }
  },
};
