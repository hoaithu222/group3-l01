import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, type InfiniteData, type QueryKey, type UseInfiniteQueryResult } from '@tanstack/react-query';

import { chatKeys } from '../api/chat.keys';
import { chatService, type ListMessagesParams } from '../api/chat.service';
import type { ChatScopeRef, MessagesPage, MessageView } from '../api/chat.types';
import { flattenMessages, type MessagesPageParam } from '../cache/message-pages';

export type MessagesAnchor = { mode: 'latest' } | { mode: 'around'; messageId: string };

/** `staleTime` của cache tin — `useChatRoomSocket` dùng lại để biết mở phòng có được tải lại hay dùng thẳng cache. */
export const MESSAGES_STALE_MS = 30_000;

function toListParams(pageParam: MessagesPageParam, threadId: string | undefined): ListMessagesParams {
  const base = { threadId };
  switch (pageParam.kind) {
    case 'latest':
      return base;
    case 'around':
      return { ...base, around: pageParam.anchor };
    case 'before':
      return { ...base, beforeSeq: pageParam.beforeSeq };
    case 'after':
      return { ...base, afterSeq: pageParam.afterSeq };
  }
}

/**
 * ⚠️ `type` giao (`&`), KHÔNG `interface extends`: `UseInfiniteQueryResult` là
 * UNION các trạng thái tải (pending/error/success — mỗi trạng thái một tập
 * field khác nhau, vd `error` chỉ có ở nhánh lỗi), và `interface extends` của
 * TypeScript chỉ nhận object type — nối union vào `extends` là `tsc` đỏ TS2312.
 */
export type UseMessagesResult = UseInfiniteQueryResult<InfiniteData<MessagesPage, MessagesPageParam>, Error> & {
  messages: MessageView[];
  anchor: MessagesAnchor;
  /** Tin không có trong cache hiện tại (`?m=`, quote, kết quả tìm) — `reset` query sang trang around, KHÔNG nối với trang đang có (app.md §3 "Jump/around"). */
  jumpTo: (messageId: string) => void;
  /** "Về tin mới nhất" — quay lại chế độ `latest` (queryKey riêng, có thể còn cache cũ ≤ 30s). */
  resetToLatest: () => void;
};

/**
 * `InfiniteData` HAI CHIỀU (app.md §4.2): `getNextPageParam`/`fetchNextPage` đi
 * theo `afterSeq` (tin MỚI hơn — trang cuối mảng `pages`), `getPreviousPageParam`/
 * `fetchPreviousPage` đi theo `beforeSeq` (tin CŨ hơn — trang đầu mảng). Đây là
 * ánh xạ TỰ NHIÊN vì danh sách render theo thứ tự thời gian tăng dần
 * (`message-pages.ts` — FlashList 2.x không còn `inverted`), khác app.md mô tả
 * cho FlashList 1.x đảo ngược (ở đó "next" lại là "cũ hơn").
 *
 * Mở `around` một tin (`initialAnchor`) dùng KHOÁ RIÊNG (`chatKeys.around`) —
 * tách khỏi khoá `latest` (`chatKeys.messages`) mà socket vá trực tiếp
 * (`useChatRoomSocket`), đúng ý "không nối với trang hiện có".
 */
export function useMessages(scope: ChatScopeRef, initialAnchor: MessagesAnchor = { mode: 'latest' }): UseMessagesResult {
  const [anchor, setAnchor] = useState<MessagesAnchor>(initialAnchor);

  // ⚠️ `QueryKey` rộng (không phải union hẹp của hai kiểu tuple `messages`/`around`)
  // — để TRẦN generic thứ tư của `useInfiniteQuery` bên dưới, tránh `tsc` suy luận
  // ra một union tuple lệch nhau rồi từ chối khớp `queryFn`/`pageParam` (TS2769).
  const queryKey: QueryKey = anchor.mode === 'around' ? chatKeys.around(scope, anchor.messageId) : chatKeys.messages(scope);
  const initialPageParam: MessagesPageParam =
    anchor.mode === 'around' ? { kind: 'around', anchor: anchor.messageId } : { kind: 'latest' };

  const query = useInfiniteQuery<MessagesPage, Error, InfiniteData<MessagesPage, MessagesPageParam>, QueryKey, MessagesPageParam>({
    queryKey,
    queryFn: ({ pageParam }) => chatService.list(scope, toListParams(pageParam, scope.threadId)),
    initialPageParam,
    getNextPageParam: (last) =>
      last.meta.hasMoreAfter && last.meta.nextAfterSeq !== null ? { kind: 'after', afterSeq: last.meta.nextAfterSeq } : undefined,
    getPreviousPageParam: (first) =>
      first.meta.hasMoreBefore && first.meta.nextBeforeSeq !== null
        ? { kind: 'before', beforeSeq: first.meta.nextBeforeSeq }
        : undefined,
    staleTime: MESSAGES_STALE_MS,
    enabled: Boolean(scope.scopeId),
  });

  const messages = useMemo(() => flattenMessages(query.data), [query.data]);

  const jumpTo = useCallback((messageId: string) => setAnchor({ mode: 'around', messageId }), []);
  const resetToLatest = useCallback(() => setAnchor({ mode: 'latest' }), []);

  return { ...query, messages, anchor, jumpTo, resetToLatest };
}
