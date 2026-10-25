import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { guestsService, workspaceAccessService, type UpdateGuestPayload } from '../api';
import { guestKeys } from './invitations.keys';
import { memberKeys } from './members.keys';

/** Kênh chọn được cho khách — dùng ở `InviteGuest`/`ManageGuest`. */
export function useGuestChannelOptions(wsId: string) {
  return useQuery({
    queryKey: guestKeys.channelOptions(wsId),
    queryFn: () => guestsService.listChannelOptions(wsId),
    enabled: Boolean(wsId),
    // 0: kênh được tạo/đổi tên/lưu trữ ở feature `channels` — không ai làm mới khoá riêng này, mở màn là tải lại nền.
    staleTime: 0,
  });
}

/** `PATCH …/guest` — sửa hạn/kênh. 409 `RES_003`: tải lại thẻ (`expectedVersion` lệch). */
export function useUpdateGuest(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: UpdateGuestPayload }) =>
      guestsService.update(wsId, userId, payload),
    onSuccess: (_row, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.card(wsId, userId) });
      void queryClient.invalidateQueries({ queryKey: memberKeys.listAll(wsId) });
    },
    onError: (_error, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.card(wsId, userId) });
    },
  });
}

/**
 * Vai trò của MÌNH + chính sách mời khách của nhóm. Chung khoá
 * `['workspaces','detail',wsId]` với `workspaces`/`channels` (xem
 * `workspace-access.service.ts`); `select` cắt ra đúng phần màn cần.
 *
 * ⚠️ Chỉ ĐỌC `myRole`/`myPermissions` mà BE trả — không tự suy vai trò từ nguồn
 * nào khác. Quyền thật vẫn do BE quyết (mọi nút ở đây chỉ để ẩn/khoá cho gọn).
 */
export function useWorkspaceAccess(wsId: string) {
  return useQuery({
    queryKey: ['workspaces', 'detail', wsId],
    queryFn: () => workspaceAccessService.get(wsId),
    enabled: Boolean(wsId),
    staleTime: 30_000,
    select: (detail) => {
      const isOwner = detail.myRole === 'OWNER';
      return {
        myRole: detail.myRole,
        isOwner,
        /** Duyệt yêu cầu, xem danh sách lời mời, mời/quản lý khách — OWNER/ADMIN (README p3-04 §6). */
        canManageMembers: isOwner || detail.myRole === 'ADMIN',
        /** `myPermissions.canInvite`: OWNER/ADMIN, hoặc MEMBER khi `guestPolicy.memberCanInvite`. */
        canInviteByEmail: detail.myPermissions.canInvite,
        guestEnabled: detail.guestPolicy?.enabled === true,
        maxGuestDays: detail.guestPolicy?.maxDays,
        joinPolicy: detail.joinPolicy ?? 'OPEN',
      };
    },
  });
}
