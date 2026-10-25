import { useInvitations } from '../queries/invitations.queries';
import type { InvitationDto } from '../api';

/** Ba tab của app.md p3-04 §3; "ENDED" gộp Đã thu hồi + Hết hạn (BE lọc MỘT `status`/lượt). */
export type InvitationTab = 'PENDING' | 'ACCEPTED' | 'ENDED';

export interface InvitationTabState {
  error: unknown;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  items: InvitationDto[];
  refetch: () => void;
}

/**
 * Hợp nhất các truy vấn của MỘT tab. Chỉ tab đang mở mới gọi mạng (`enabled`), nên
 * mở màn không kéo cả bốn trạng thái. Tab "ENDED" chạy hai truy vấn (REVOKED +
 * EXPIRED) rồi trộn theo `createdAt` mới → cũ.
 */
export function useInvitationTab(wsId: string, tab: InvitationTab): InvitationTabState {
  const pending = useInvitations(wsId, 'PENDING', tab === 'PENDING');
  const accepted = useInvitations(wsId, 'ACCEPTED', tab === 'ACCEPTED');
  const revoked = useInvitations(wsId, 'REVOKED', tab === 'ENDED');
  const expired = useInvitations(wsId, 'EXPIRED', tab === 'ENDED');

  const queries = tab === 'PENDING' ? [pending] : tab === 'ACCEPTED' ? [accepted] : [revoked, expired];

  const items = queries
    .flatMap((query) => query.data?.pages.flatMap((page) => page.items) ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    error: queries.find((query) => query.isError)?.error,
    fetchNextPage: () => {
      for (const query of queries) if (query.hasNextPage) void query.fetchNextPage();
    },
    hasNextPage: queries.some((query) => query.hasNextPage),
    isError: queries.some((query) => query.isError),
    isFetchingNextPage: queries.some((query) => query.isFetchingNextPage),
    isLoading: queries.some((query) => query.isLoading),
    isRefetching: queries.some((query) => query.isRefetching),
    items,
    refetch: () => {
      for (const query of queries) void query.refetch();
    },
  };
}
