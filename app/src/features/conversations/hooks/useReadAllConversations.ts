import { useMutation, useQueryClient } from '@tanstack/react-query';

import { notificationKeys, readStateService } from '@/core/notifications';

import { conversationKeys } from '../api/conversations.keys';
import type { ConversationFilter } from '../api/conversations.types';
import { applyReadAllInList } from '../cache/apply-conversation-read';
import type { ConversationListData } from '../cache/conversation-list-pages';

/**
 * "Đánh dấu tất cả đã đọc" ở danh sách hội thoại (p1-07 `app.md` §4.5): `before` do CLIENT chốt lúc bấm nên tin đến sau đó vẫn
 * chưa đọc (NT-13). LẠC QUAN — mọi hàng `activityAt ≤ before` về 0 ngay, lỗi thì khôi phục. Server phát
 * `unread:summary-changed { READ_ALL }` và `read:receipt` (≤ 100 hội thoại) — số chuẩn về qua làm mới danh sách/tóm tắt.
 *
 * ⛔ KHÔNG tự toast lỗi: `apiClient` đã toast (cùng lý do các mutation khác).
 */
export function useReadAllConversations() {
  const queryClient = useQueryClient();
  const listKey = [...conversationKeys.all, 'list'];

  return useMutation({
    mutationFn: (before: string) => readStateService.readAllConversations(before),
    onMutate: async (before) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all });
      const previous = queryClient.getQueriesData<ConversationListData>({ queryKey: listKey });
      for (const [key, data] of previous) {
        const filter = (key[2] as { filter: ConversationFilter } | undefined)?.filter ?? 'all';
        queryClient.setQueryData(key, applyReadAllInList(data, filter, before));
      }
      return { previous };
    },
    onError: (_error, _before, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
    },
  });
}
