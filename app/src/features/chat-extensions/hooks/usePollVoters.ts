import { useInfiniteQuery } from '@tanstack/react-query';

import { pollKeys } from '../api/chat-extensions.keys';
import { pollService } from '../api/poll.service';

/**
 * Người đã chọn MỘT lựa chọn (cursor). `retry: false`: 403 `POLL_006` (ẩn danh) và 404 `POLL_005` là kết luận cuối — thử lại vẫn thế, hiện ngay.
 * `optionId` rỗng (chưa chọn lựa chọn nào) ⇒ không gọi.
 */
export function usePollVoters(pollId: string, optionId: string | undefined) {
  return useInfiniteQuery({
    queryKey: pollKeys.voters(pollId, optionId ?? ''),
    enabled: optionId !== undefined && optionId !== '',
    queryFn: ({ pageParam }) => pollService.voters(pollId, { optionId: optionId ?? '', cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    retry: false,
    staleTime: 15_000,
  });
}
