import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { chatKeys } from '../api/chat.keys';
import { chatService } from '../api/chat.service';
import type { ForwardPersonOption, ForwardTargetOption } from '../api/chat.types';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * Nguồn đích cho `ForwardSheet`: KÊNH/hội thoại do màn cha cấp (`searchTargets`), NGƯỜI (gửi tin riêng)
 * tự tìm qua `chatService.searchPeople`. Cùng một từ khoá (debounce 300 ms) cho cả hai.
 *
 * Lỗi tìm NGƯỜI (`skipErrorToast`) chỉ làm nhóm đó rỗng — chuyển tiếp tới KÊNH vẫn dùng được.
 */
export function useForwardTargets(
  visible: boolean,
  query: string,
  searchTargets?: (query: string) => Promise<ForwardTargetOption[]>,
) {
  const debounced = useDebouncedValue(query).trim();
  const [scopes, setScopes] = useState<ForwardTargetOption[]>([]);

  useEffect(() => {
    if (!visible || !searchTargets) return undefined;
    let cancelled = false;
    searchTargets(debounced)
      .then((opts) => {
        if (!cancelled) setScopes(opts);
      })
      .catch(() => {
        if (!cancelled) setScopes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, debounced, searchTargets]);

  const peopleQuery = useQuery({
    queryKey: chatKeys.forwardPeople(debounced),
    queryFn: () => chatService.searchPeople(debounced),
    enabled: visible,
    staleTime: 30_000,
    retry: false,
  });

  const people: ForwardPersonOption[] = (peopleQuery.data ?? []).map((p) => ({
    userId: p.userId,
    label: p.name,
    avatarUrl: p.avatarUrl,
  }));

  return { people, scopes, isLoadingPeople: peopleQuery.isLoading };
}
