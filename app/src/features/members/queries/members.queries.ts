import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import {
  membersService,
  type ListMembersFilter,
  type MemberCard,
  type MemberListPage,
  type ModerateMemberPayload,
  type PatchMemberPayload,
} from '../api';
import { memberKeys } from './members.keys';

/**
 * `workspaceKeys` (feature `workspaces`) không import được ở đây — luật "không
 * import chéo feature" (`feature-structure.md`). Hai mảng khoá dưới đây LÀ
 * đúng hình dạng `workspaceKeys.detail`/`.overview` (`workspaces/queries/workspaces.keys.ts`),
 * ghi tay có chủ đích: `queryClient.invalidateQueries` chỉ cần đúng MẢNG khoá,
 * không cần import hàm tạo ra nó.
 */
function invalidateWorkspaceSummary(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: ['workspaces', 'detail', wsId] });
  void queryClient.invalidateQueries({ queryKey: ['workspaces', 'overview', wsId] });
}

/**
 * Tên/vai trò/trạng thái của một thành viên vừa đổi ⇒ làm mới MỌI bản chép của nó.
 *
 *  · Danh sách thành viên (mọi bộ lọc): vá tại chỗ (`updateMemberLists`) chỉ sửa/gỡ dòng ĐANG có — dòng đổi vai trò vẫn nằm
 *    trong tab lọc cũ, người bị chặn không hiện ở tab "Đã chặn", tổng số trên đầu màn đứng im.
 *  · Kênh (khoá `channels.keys.ts`): danh bạ tác giả + danh sách thành viên theo TỪNG kênh (`['channels', chId, 'members', …]`
 *    — khoá theo kênh nên lọc bằng vị trí phần tử), bộ chọn thành viên/đếm theo vai trò (`['channels', wsId, …]`).
 *  · Ứng viên nhận quyền chủ nhóm (`workspaces.keys.ts` `transferCandidates`).
 */
export function invalidateMemberCopies(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: memberKeys.listAll(wsId) });
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'channels' && query.queryKey[2] === 'members',
  });
  void queryClient.invalidateQueries({ queryKey: ['channels', wsId] });
  void queryClient.invalidateQueries({ queryKey: ['workspaces', 'transfer-candidates', wsId] });
}

/**
 * Xoá/đổi MỘT dòng trong MỌI trang danh sách (mọi filter) của workspace này.
 * Export để `hooks/useMemberSocket.ts` dùng lại cho `member:updated` — cùng
 * việc, khác nguồn gọi (mutation ở đây, sự kiện realtime ở đó).
 */
export function updateMemberLists(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string,
  userId: string,
  updater: (row: MemberListPage['items'][number]) => MemberListPage['items'][number] | null,
): void {
  queryClient.setQueriesData<InfiniteData<MemberListPage>>(
    { queryKey: memberKeys.listAll(wsId) },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.flatMap((row) => {
            if (row.userId !== userId) return [row];
            const next = updater(row);
            return next ? [next] : [];
          }),
        })),
      };
    },
  );
}

/** `useInfiniteQuery` phân trang theo `page` (be.md §4: `ResponseUtils.paginated`). */
export function useMembers(wsId: string, filter: ListMembersFilter) {
  return useInfiniteQuery({
    queryKey: memberKeys.list(wsId, filter),
    queryFn: ({ pageParam }) => membersService.list(wsId, filter, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
}

/** Mở thẻ mới fetch (app.md §4) — không mồi từ dòng danh sách vì `MemberCard` có thêm `actions`. */
export function useMemberCard(wsId: string, userId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.card(wsId, userId ?? ''),
    queryFn: () => membersService.card(wsId, userId as string),
    enabled: Boolean(wsId && userId),
  });
}

export function usePatchMember(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: PatchMemberPayload }) =>
      membersService.patch(wsId, userId, payload),
    onSuccess: (updated, { userId }) => {
      updateMemberLists(queryClient, wsId, userId, () => updated);
      queryClient.setQueryData<MemberCard>(memberKeys.card(wsId, userId), (prev) =>
        prev ? { ...prev, ...updated } : prev,
      );
      invalidateWorkspaceSummary(queryClient, wsId);
      invalidateMemberCopies(queryClient, wsId);
    },
  });
}

function useModerateMember(wsId: string, run: (userId: string, payload: ModerateMemberPayload) => Promise<void>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: ModerateMemberPayload }) =>
      run(userId, payload),
    onSuccess: (_result, { userId }) => {
      // Loại/chặn/gỡ chặn đều đổi `status` khỏi giá trị đang lọc ⇒ bỏ dòng khỏi
      // MỌI trang đang cache (app.md §4: "onSuccess: setQueryData bỏ/đổi dòng").
      updateMemberLists(queryClient, wsId, userId, () => null);
      queryClient.removeQueries({ queryKey: memberKeys.card(wsId, userId) });
      invalidateWorkspaceSummary(queryClient, wsId);
      invalidateMemberCopies(queryClient, wsId);
    },
  });
}

export function useRemoveMember(wsId: string) {
  return useModerateMember(wsId, (userId, payload) => membersService.remove(wsId, userId, payload));
}

export function useBanMember(wsId: string) {
  return useModerateMember(wsId, (userId, payload) => membersService.ban(wsId, userId, payload));
}

export function useUnbanMember(wsId: string) {
  return useModerateMember(wsId, (userId, payload) => membersService.unban(wsId, userId, payload));
}
