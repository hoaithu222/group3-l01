import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { chatService } from '../api/chat.service';
import type { ChatScopeRef } from '../api/chat.types';
import { appendFetchedPage, type MessagesData } from '../cache/message-pages';
import { MESSAGES_STALE_MS } from './useMessages';

/**
 * Cache tin có sẵn và còn trong `staleTime` ⇒ `useMessages` dùng thẳng, KHÔNG tải lại khi mở màn — đúng ca phải tự bù các tin
 * đến trong lúc vắng (socket không nhận tin của phòng đã rời). Chỉ đọc trạng thái cache, không phụ thuộc lượt tải đã chạy chưa.
 */
export function isFreshMessagesCache(queryClient: QueryClient, queryKey: QueryKey): boolean {
  const state = queryClient.getQueryState(queryKey);
  if (!state?.data || state.isInvalidated) return false;
  return Date.now() - state.dataUpdatedAt < MESSAGES_STALE_MS;
}

/** An toàn — chặn vòng lặp vô hạn nếu BE trả sai `hasMoreAfter` (không nên xảy ra). */
const MAX_GAP_FILL_PAGES = 20;

/**
 * app.md §4.4 — lỗ `seq` (tin `message:created` nhảy cóc) hoặc vừa reconnect:
 * `fetch afterSeq = maxSeq(cache)` LẶP tới hết, `setQueryData` gộp bất biến.
 * Chỉ áp cho khoá `chatKeys.messages(scope)` ("latest") — khoá `around` là
 * view tạm, không đồng bộ realtime (app.md §3 "Jump/around").
 */
export async function gapFillMessages(
  queryClient: QueryClient,
  queryKey: QueryKey,
  scope: ChatScopeRef,
  fromSeq: number,
): Promise<void> {
  let afterSeq = fromSeq;
  for (let i = 0; i < MAX_GAP_FILL_PAGES; i += 1) {
    const page = await chatService.list(scope, { afterSeq, threadId: scope.threadId });
    const current = queryClient.getQueryData<MessagesData>(queryKey);
    // Query đã bị dọn khỏi cache (rời màn) giữa chừng — `useMessages` tự tải lại khi mount lại, dừng ở đây.
    if (!current) return;
    // Không có tin mới (mở lại phòng mà không ai nhắn) ⇒ KHÔNG nối trang rỗng: mỗi lần nối là thêm một trang mà lượt refetch
    // sau phải tải lại từng trang một.
    if (page.data.length === 0) return;
    queryClient.setQueryData<MessagesData>(queryKey, appendFetchedPage(current, page, afterSeq));
    if (!page.meta.hasMoreAfter) return;
    afterSeq = page.meta.nextAfterSeq ?? afterSeq;
  }
}
