import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatKeys } from '@/features/chat';
import { notificationKeys } from '@/core/notifications';
import type { NotifyChoice } from '@/shared/notifications';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail, ConversationListItem, MeSettingsPayload } from '../api/conversations.types';
import { belongsInFilter } from '../cache/apply-conversation-event';
import {
  findConversation,
  patchConversation,
  removeConversation,
  type ConversationListData,
} from '../cache/conversation-list-pages';
import { listQueries } from '../cache/conversation-side-caches';

function patchItem(payload: MeSettingsPayload) {
  return (item: ConversationListItem): ConversationListItem => ({
    ...item,
    ...(payload.pinned !== undefined && { pinnedAt: payload.pinned ? new Date().toISOString() : null }),
    ...(payload.archived !== undefined && { archivedAt: payload.archived ? new Date().toISOString() : null }),
    ...(payload.markedUnread !== undefined && { markedUnread: payload.markedUnread }),
    ...(payload.notifyMode !== undefined && { notifyMode: payload.notifyMode, muted: payload.notifyMode === 'MUTED' }),
  });
}

/**
 * app.md §4.3 — pin/mute/archive/markUnread optimistic (rollback khi lỗi,
 * `CONV_009` "tối đa 20 ghim" thì màn gọi tự toast theo `getErrorCode`); clear
 * KHÔNG optimistic riêng — gỡ khỏi list ngay khi server xác nhận.
 */
export function useMyConversationSettings(conversationId: string) {
  const queryClient = useQueryClient();
  const detailKey = conversationKeys.detail(conversationId);
  const listPredicate = { queryKey: [...conversationKeys.all, 'list'] };

  const mutation = useMutation({
    mutationFn: (payload: MeSettingsPayload) => conversationsService.updateMe(conversationId, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all });
      const previousDetail = queryClient.getQueryData<ConversationDetail>(detailKey);
      const previousLists = listQueries(queryClient);
      const previousPinned = queryClient.getQueryData<ConversationListItem[]>(conversationKeys.pinned());
      const apply = patchItem(payload);

      if (previousDetail) queryClient.setQueryData(detailKey, apply(previousDetail));
      // Hàng KHÔNG còn thuộc bộ lọc (lưu trữ ở "Tất cả", bỏ lưu trữ ở "Lưu trữ") thì gỡ ngay — vá tại chỗ để lại hàng với nhãn đã đảo.
      for (const { key, data, filter } of previousLists) {
        const found = data ? findConversation(data, conversationId) : undefined;
        if (!data || !found) continue;
        const next = belongsInFilter(filter, apply(found))
          ? patchConversation(data, conversationId, apply)
          : removeConversation(data, conversationId);
        queryClient.setQueryData(key, next);
      }
      if (previousPinned) {
        queryClient.setQueryData(
          conversationKeys.pinned(),
          previousPinned.map((item) => (item.id === conversationId ? apply(item) : item)),
        );
      }
      return { previousDetail, previousLists, previousPinned };
    },
    onError: (_error, _payload, ctx) => {
      if (!ctx) return;
      if (ctx.previousDetail) queryClient.setQueryData(detailKey, ctx.previousDetail);
      for (const { key, data } of ctx.previousLists) queryClient.setQueryData(key, data);
      if (ctx.previousPinned) queryClient.setQueryData(conversationKeys.pinned(), ctx.previousPinned);
    },
    onSettled: (_data, _error, payload) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.pinned() });
      // Lưu trữ/đánh dấu chưa đọc đổi THÀNH PHẦN danh sách: hàng phải VÀO "Lưu trữ"/"Chưa đọc" — vá lạc quan chỉ gỡ được hàng.
      if (payload.archived !== undefined || payload.markedUnread !== undefined) {
        void queryClient.invalidateQueries({ queryKey: listPredicate.queryKey });
        void queryClient.invalidateQueries({ queryKey: conversationKeys.archivedPeek() });
      }
      // Tắt tiếng/đánh dấu chưa đọc đổi số chưa đọc trên tab Tin nhắn (tóm tắt bỏ qua hội thoại tắt tiếng).
      if (payload.notifyMode !== undefined || payload.markedUnread !== undefined) {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
      }
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => conversationsService.clear(conversationId),
    onSuccess: () => {
      queryClient.setQueriesData<ConversationListData>(listPredicate, (data) => (data ? removeConversation(data, conversationId) : data));
      // Lịch sử đã xoá: đặt lại cache tin (mở lại trong 30 s vẫn thấy tin cũ) + lấy lại `detail` (`hiddenBeforeSeq`) và mục ghim.
      void queryClient.resetQueries({ queryKey: chatKeys.scope({ scopeType: 'CONVERSATION', scopeId: conversationId }) });
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.pinned() });
    },
  });

  return {
    pin: (pinned: boolean) => mutation.mutate({ pinned }),
    /**
     * `mutedUntil: null` là "bỏ hạn tắt tiếng" (BE), KHÔNG phải "bỏ tắt tiếng": tắt vô thời hạn là `MUTED` + `null`, bỏ tắt
     * tiếng là chế độ khác (`INHERIT`/`ALL`/`MENTIONS`) — mọi lựa chọn không phải `MUTED` gửi kèm `null` để xoá hạn cũ.
     */
    setNotify: (choice: NotifyChoice, mutedUntil: string | null) => mutation.mutate({ notifyMode: choice, mutedUntil }),
    archive: (archived: boolean) => mutation.mutate({ archived }),
    markUnread: (markedUnread: boolean) => mutation.mutate({ markedUnread }),
    clear: () => clearMutation.mutate(),
    isPending: mutation.isPending || clearMutation.isPending,
    error: mutation.error,
  };
}
