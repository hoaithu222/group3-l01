import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import type { AdminListMembersParams } from '../types/workspace-members.types';
import { workspaceKeys } from './workspace.queries';
import { workspaceAccessKeys } from './workspace-access.queries';
import { workspaceMembersService } from './workspace-members.service';

export const workspaceMembersKeys = {
  all: (workspaceId: string) => ['workspace', 'members', workspaceId] as const,
  list: (workspaceId: string, params: AdminListMembersParams) =>
    ['workspace', 'members', workspaceId, params] as const,
};

/** `placeholderData: keepPreviousData` — đổi trang/lọc không nháy trắng bảng. */
export const useAdminWorkspaceMembers = (workspaceId: string, params: AdminListMembersParams) =>
  useQuery({
    queryKey: workspaceMembersKeys.list(workspaceId, params),
    queryFn: () => workspaceMembersService.list(workspaceId, params),
    placeholderData: keepPreviousData,
  });

/**
 * Tải lại MỌI truy vấn thành viên của workspace — danh sách + khối yêu cầu chờ duyệt (cùng đọc `GET …/members` với tham
 * số khác nhau) VÀ `access-summary` (nguồn của ba thẻ đếm ở đầu tab). Nút "Thử lại" của tab gọi cái này thay vì
 * `refetch()` của riêng danh sách, nếu không bảng đã hiện lại mà ba thẻ đếm vẫn kẹt "—".
 */
export const useReloadMembers = (workspaceId: string) => {
  const qc = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: workspaceMembersKeys.all(workspaceId) }),
        qc.invalidateQueries({ queryKey: workspaceAccessKeys.summary(workspaceId) }),
      ]),
    [qc, workspaceId],
  );
};

export const useRevokeMember = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason, ban }: { userId: string; reason: string; ban: boolean }) =>
      workspaceMembersService.revoke({ workspaceId, userId, reason, ban }),
    onSuccess: () => {
      // admin.md p1-02 §3: invalidate danh sách thành viên + chi tiết workspace
      // (memberCount đổi sau khi thu hồi — `services/membership-lifecycle.service.ts#revokeInTx`).
      void qc.invalidateQueries({ queryKey: workspaceMembersKeys.all(workspaceId) });
      // Ba thẻ đếm ở đầu tab đọc `access-summary` — thu hồi/chặn đổi số ACTIVE/bị chặn.
      void qc.invalidateQueries({ queryKey: workspaceAccessKeys.summary(workspaceId) });
      void qc.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
      showToast('success', 'Đã xử lý thành viên và ghi nhật ký');
    },
  });
};
