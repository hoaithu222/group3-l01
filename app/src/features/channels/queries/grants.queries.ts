import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { grantsService, type AddGrantsPayload, type PatchGrantPayload, type RoleRef } from '../api';
import { channelKeys } from './channels.keys';

export function useChannelGrants(chId: string) {
  return useQuery({
    queryKey: channelKeys.grants(chId),
    queryFn: () => grantsService.list(chId),
    enabled: Boolean(chId),
  });
}

function useInvalidateGrantScope(chId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: channelKeys.grants(chId) });
    // Tiền tố — khớp MỌI trang `members(chId, q)` bất kể `q`, cùng cách
    // `memberKeys.listAll` của feature `members` đã làm (p1-02).
    void queryClient.invalidateQueries({ queryKey: ['channels', chId, 'members'] });
  };
}

export function useAddGrants(chId: string) {
  const invalidate = useInvalidateGrantScope(chId);
  return useMutation({
    mutationFn: (payload: AddGrantsPayload) => grantsService.add(chId, payload),
    onSuccess: invalidate,
  });
}

export function usePatchGrant(chId: string) {
  const invalidate = useInvalidateGrantScope(chId);
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: PatchGrantPayload }) =>
      grantsService.patch(chId, userId, payload),
    onSuccess: invalidate,
  });
}

/**
 * Thu hồi grant — kể cả TỰ MÌNH rời kênh riêng tư (be.md §4: "chính mình hoặc
 * `manage`"). Tự thu hồi chính mình được coi như MẤT QUYỀN (app.md §4): màn
 * gọi (`ChannelMembersScreen`) tự so `userId` với người dùng hiện tại rồi điều
 * hướng ra ngoài — hook chỉ lo phần dữ liệu, không phụ thuộc auth store.
 */
export function useRevokeGrant(chId: string) {
  const invalidate = useInvalidateGrantScope(chId);
  return useMutation({
    mutationFn: (userId: string) => grantsService.revoke(chId, userId),
    onSuccess: invalidate,
  });
}

/** Cấp cả VAI TRÒ (p3-04, chỉ kênh PRIVATE, chỉ MANAGER). Làm mới cả danh sách thành viên: người có vai trò đó bỗng đọc được kênh. */
export function useAddRoleGrant(chId: string) {
  const invalidate = useInvalidateGrantScope(chId);
  return useMutation({
    mutationFn: (roleRef: RoleRef) => grantsService.addRole(chId, roleRef),
    onSuccess: invalidate,
  });
}

/** Gỡ cả vai trò — người chỉ còn quyền qua vai trò này mất quyền ngay (BE `revokeScope`). */
export function useRemoveRoleGrant(chId: string) {
  const invalidate = useInvalidateGrantScope(chId);
  return useMutation({
    mutationFn: (roleRef: RoleRef) => grantsService.removeRole(chId, roleRef),
    onSuccess: invalidate,
  });
}
