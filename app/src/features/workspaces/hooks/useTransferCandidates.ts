import { useMemo, useState } from 'react';

import type { TransferOwnerMemberOption } from '../components/TransferOwnerSheet';
import { useTransferCandidates as useTransferCandidatesQuery } from '../queries/workspace-members.queries';
import { useDebouncedValue } from './useDebouncedValue';

export interface UseTransferCandidatesResult {
  members: TransferOwnerMemberOption[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** Gắn thẳng vào `onChangeText` của `SearchInput` — hook tự debounce trước khi gọi server. */
  setQuery: (query: string) => void;
}

/**
 * Nối danh sách thành viên THẬT (`GET /workspaces/:id/members`) vào
 * `TransferOwnerSheet` qua props — màn cài đặt gọi hook này rồi truyền xuống,
 * KHÔNG import feature `members` (`feature-structure.md`).
 *
 * `name` hiển thị = `displayName ?? name`: chính là chuỗi BE dùng để so khớp
 * `confirmName` (`workspace-lifecycle.service.ts#transferOwner`) — hiện đúng tên
 * người dùng phải gõ lại, không phải một tên khác của cùng người.
 */
export function useTransferCandidates(workspaceId: string, enabled: boolean): UseTransferCandidatesResult {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const result = useTransferCandidatesQuery(workspaceId, debouncedQuery, enabled);

  const members = useMemo(
    () =>
      (result.data ?? []).map((candidate) => ({
        id: candidate.userId,
        name: candidate.displayName ?? candidate.name,
        avatarUrl: candidate.avatarUrl,
      })),
    [result.data],
  );

  return {
    members,
    isLoading: result.isLoading,
    isError: result.isError,
    refetch: () => void result.refetch(),
    setQuery,
  };
}
