import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ContactInput } from '@/shared/utils/contact.utils';

import { memberAddService } from '../api';
import { memberKeys } from './members.keys';

/**
 * Tra người theo email/SĐT ĐẦY ĐỦ. Chỉ chạy khi ô nhập đã đủ (`kind !== 'INCOMPLETE'`) — BE từ chối tên/chuỗi dở dang bằng 400
 * và tính vào hạn mức tra cứu theo NGƯỜI DÙNG (30 lượt/10 phút), nên không bắn lượt nào "để xem thử".
 *
 * `retry: false`: 403/404/429 là trạng thái nghiệp vụ — thử lại không đổi kết quả, chỉ ăn thêm hạn mức.
 */
export function useMemberLookup(wsId: string, contact: ContactInput) {
  return useQuery({
    queryKey: memberKeys.lookup(wsId, contact.value),
    queryFn: () => memberAddService.lookup(wsId, contact.value),
    enabled: Boolean(wsId) && contact.kind !== 'INCOMPLETE',
    retry: false,
    staleTime: 15_000,
  });
}

/**
 * Thêm thẳng một người vào nhóm. `onSuccess` làm mới: danh sách thành viên, kết quả tra (người vừa thêm chuyển sang "Đã trong
 * nhóm") và số thành viên ở chi tiết/tổng quan nhóm. Khoá của feature `workspaces` viết dạng chuỗi (không import chéo feature) —
 * cùng cách `useAcceptInvite` làm với `['workspaces', 'list']`.
 */
export function useAddMember(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => memberAddService.add(wsId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.listAll(wsId) });
      void queryClient.invalidateQueries({ queryKey: memberKeys.lookupAll(wsId) });
      void queryClient.invalidateQueries({ queryKey: ['workspaces', 'detail', wsId] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces', 'overview', wsId] });
    },
  });
}
