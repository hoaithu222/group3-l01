import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { channelsService } from '../api';
import { channelKeys } from './channels.keys';

/** Danh sách người trong kênh — public: `ChannelMembership`; private: grant (be.md §4). */
export function useChannelMembers(chId: string, q: string) {
  const trimmed = q.trim();
  return useInfiniteQuery({
    queryKey: channelKeys.members(chId, trimmed),
    queryFn: ({ pageParam }) => channelsService.members(chId, pageParam, trimmed || undefined),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    enabled: Boolean(chId),
  });
}

/** Thành viên NHÓM đang ACTIVE — bộ chọn của `AudienceStep` và `AddGrantSheet`. */
export function useWorkspaceMemberOptions(wsId: string, q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: channelKeys.memberOptions(wsId, trimmed),
    queryFn: () => channelsService.searchWorkspaceMembers(wsId, trimmed || undefined),
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
}

/** Số người mỗi trang khi dựng "danh bạ tác giả" — trần `paginationSchema` phía BE (max 100). */
export const AUTHOR_DIRECTORY_PAGE_SIZE = 100;

/**
 * Trang danh sách người trong kênh dùng để tra tên tác giả tin nhắn. Nơi gọi tự
 * kéo hết các trang (`useChannelAuthors`) — cần đủ người chứ không phải một trang.
 */
export function useChannelMemberDirectory(chId: string) {
  return useInfiniteQuery({
    queryKey: channelKeys.memberDirectory(chId),
    queryFn: ({ pageParam }) => channelsService.members(chId, pageParam, undefined, AUTHOR_DIRECTORY_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    enabled: Boolean(chId),
    staleTime: 60_000,
  });
}
