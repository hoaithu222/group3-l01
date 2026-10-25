import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { scopeKeyOf } from '@/core/socket';

import { chatKeys } from '../api/chat.keys';
import { chatService } from '../api/chat.service';
import type { ChatScopeRef } from '../api/chat.types';
import { flattenMessages, maxLoadedSeq, type MessagesData } from '../cache/message-pages';
import { useOutboxStore, type PendingMessage } from '../store/outbox.store';

/**
 * `FAILED --Sửa--> đưa nội dung về Composer` (app.md §4.3) — nhưng CHỈ SAU KHI
 * xác nhận server thật sự chưa nhận bản này, tránh gửi trùng nếu HTTP báo lỗi
 * nhưng server đã tạo tin (mất gói phản hồi, không phải mất gói yêu cầu).
 *
 * Hai bước xác nhận, RẺ trước ĐẮT sau:
 *  1. Cache đã tải (`messages`) có tin nào cùng `clientMessageId` chưa — socket
 *     `message:created`/gap-fill có thể đã âm thầm chèn nó trong lúc item còn
 *     nằm ở outbox dưới dạng FAILED.
 *  2. Không có thì gọi thật `GET .../messages?afterSeq=<seq đã tải>` một lượt —
 *     đúng "?afterSeq xác nhận chưa có bản server" mà app.md yêu cầu.
 *
 * Cả hai nhánh đều XOÁ pending khỏi outbox trước khi trả về: tìm thấy trên
 * server ⇒ không cần sửa gì nữa (chỉ cần đồng bộ cache); không tìm thấy ⇒ nội
 * dung được giao lại cho Composer, gửi tiếp PHẢI qua `useSendMessage().send()`
 * (sinh `clientMessageId` MỚI) — không dùng lại id đã "Sửa".
 */
export function useResendFailedMessage(scope: ChatScopeRef) {
  const queryClient = useQueryClient();
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);
  const queryKey = chatKeys.messages(scope);

  return useCallback(
    async (clientMessageId: string): Promise<PendingMessage | undefined> => {
      const pending = useOutboxStore.getState().byScope[scopeKey]?.find((m) => m.clientMessageId === clientMessageId);
      if (!pending) return undefined;

      const current = queryClient.getQueryData<MessagesData>(queryKey);
      const foundLocally = current && flattenMessages(current).some((m) => m.clientMessageId === clientMessageId);
      if (foundLocally) {
        useOutboxStore.getState().remove(scopeKey, clientMessageId);
        return undefined;
      }

      const probe = await chatService.list(scope, { afterSeq: maxLoadedSeq(current), threadId: scope.threadId });
      const foundOnServer = probe.data.some((m) => m.clientMessageId === clientMessageId);
      useOutboxStore.getState().remove(scopeKey, clientMessageId);
      if (foundOnServer) {
        void queryClient.invalidateQueries({ queryKey });
        return undefined;
      }
      return pending;
    },
    [queryClient, queryKey, scope, scopeKey],
  );
}
