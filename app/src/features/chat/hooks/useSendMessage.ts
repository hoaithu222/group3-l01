import { useCallback } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { scopeKeyOf } from '@/core/socket';

import { chatKeys } from '../api/chat.keys';
import { chatService } from '../api/chat.service';
import type { ChatScopeRef, MessageMention, SendMessageAttachmentInput } from '../api/chat.types';
import { appendToLatestPage, flattenMessages, isCaughtUpToLatest, type MessagesData } from '../cache/message-pages';
import { useOutboxStore, type PendingMessage, type PendingPreview } from '../store/outbox.store';
import { notifyMessageSent } from './message-sent-listeners';
import { newClientMessageId } from '../utils/client-message-id';
import { classifySendError } from '../utils/send-error';

const AUTO_RETRY_DELAY_MS = 2000;

export interface SendMessageInput {
  content?: string;
  attachments?: SendMessageAttachmentInput[];
  /** Ảnh cục bộ để vẽ ngay trong bản tạm (chỉ phía máy, không gửi lên BE). */
  previews?: PendingPreview[];
  mentions?: MessageMention[];
  replyToId?: string;
}

export interface UseSendMessageResult {
  /** `DRAFT --bấm Gửi--> SENDING`, luôn sinh `clientMessageId` MỚI (app.md §4.3). */
  send: (input: SendMessageInput) => void;
  /** `FAILED --Thử lại--> SENDING`, CÙNG `clientMessageId`. */
  retry: (clientMessageId: string) => void;
  /** `FAILED --Xoá bản chờ-->` khỏi outbox. */
  discard: (clientMessageId: string) => void;
}

interface SendContext {
  queryClient: QueryClient;
  queryKey: QueryKey;
  scope: ChatScopeRef;
  scopeKey: string;
}

/**
 * Hàm THUẦN ở NGOÀI component — không phải giá trị `useCallback` — CỐ Ý: nhánh
 * `RECONCILE` (app.md §4.3) tự gọi lại chính nó qua `setTimeout` sau 2s, và
 * React Compiler (`react-hooks/immutability`) từ chối một `useCallback` tự
 * tham chiếu tới chính nó (đọc giá trị trước khi gán xong). Một hàm module-scope
 * nhận đủ context qua tham số thì không có khái niệm "đọc trước khi gán".
 */
async function attemptSendMessage(ctx: SendContext, pending: PendingMessage): Promise<void> {
  const { queryClient, queryKey, scope, scopeKey } = ctx;
  try {
    const view = await chatService.send(scope, {
      clientMessageId: pending.clientMessageId,
      content: pending.content,
      attachments: pending.attachments,
      mentions: pending.mentions,
      replyToId: pending.replyToId,
    });
    // Chèn bản thật vào cache TRƯỚC, rồi mới gỡ bản tạm khỏi outbox — đảo lại thì có một nhịp bong bóng biến mất trước khi bản thật hiện.
    // Socket có thể đã chèn + xoá outbox TRƯỚC KHI HTTP về (TX-02) — `remove` là no-op an toàn lúc đó.
    const current = queryClient.getQueryData<MessagesData>(queryKey);
    if (current && !flattenMessages(current).some((m) => m.id === view.id)) {
      if (isCaughtUpToLatest(current)) {
        queryClient.setQueryData<MessagesData>(queryKey, appendToLatestPage(current, view));
      } else {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
    useOutboxStore.getState().remove(scopeKey, pending.clientMessageId);
    notifyMessageSent(view);
  } catch (error) {
    const info = classifySendError(error);
    // Lỗi MẠNG/timeout (không `code`) và CHƯA tự thử lại lần nào ⇒ RECONCILE.
    if (info.code === undefined && !pending.autoRetried) {
      useOutboxStore.getState().update(scopeKey, pending.clientMessageId, { autoRetried: true });
      setTimeout(() => {
        const stillPending = useOutboxStore
          .getState()
          .byScope[scopeKey]?.find((m) => m.clientMessageId === pending.clientMessageId);
        if (stillPending?.status === 'SENDING') void attemptSendMessage(ctx, stillPending);
      }, AUTO_RETRY_DELAY_MS);
      return;
    }
    useOutboxStore.getState().update(scopeKey, pending.clientMessageId, {
      status: 'FAILED',
      failCode: info.code,
      failMessage: info.message,
      failInvalidMentionUserIds: info.invalidMentionUserIds,
      retryAfterAt: info.retryAfterAt,
    });
  }
}

/**
 * Máy trạng thái gửi tin optimistic — app.md §4.3. `outbox.store` giữ bản tạm
 * theo `clientMessageId`; thành công thì XOÁ khỏi outbox và chèn `MessageView`
 * thật vào cache CHỈ KHI socket chưa làm việc đó trước (`useChatRoomSocket` —
 * "SENDING → socket `message:created` trùng id → SENT, HTTP về sau bỏ qua").
 */
export function useSendMessage(scope: ChatScopeRef): UseSendMessageResult {
  const queryClient = useQueryClient();
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);
  const queryKey: QueryKey = chatKeys.messages(scope);
  const ctx: SendContext = { queryClient, queryKey, scope, scopeKey };

  const send = useCallback(
    (input: SendMessageInput) => {
      const pending: PendingMessage = {
        clientMessageId: newClientMessageId(),
        scope,
        status: 'SENDING',
        createdAtLocal: new Date().toISOString(),
        autoRetried: false,
        ...input,
      };
      useOutboxStore.getState().add(scopeKey, pending);
      void attemptSendMessage(ctx, pending);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ctx` bao mọi phụ thuộc thật (queryClient/queryKey/scope/scopeKey), tạo mới mỗi render nhưng CHỈ mang dữ liệu (không phải state cần so sánh identity).
    [scope, scopeKey],
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      const pending = useOutboxStore.getState().byScope[scopeKey]?.find((m) => m.clientMessageId === clientMessageId);
      if (!pending) return;
      const next: PendingMessage = {
        ...pending,
        status: 'SENDING',
        autoRetried: false,
        failCode: undefined,
        failMessage: undefined,
        failInvalidMentionUserIds: undefined,
        retryAfterAt: undefined,
      };
      useOutboxStore.getState().update(scopeKey, clientMessageId, next);
      void attemptSendMessage(ctx, next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- xem chú thích của `send` ở trên.
    [scopeKey],
  );

  const discard = useCallback((clientMessageId: string) => useOutboxStore.getState().remove(scopeKey, clientMessageId), [scopeKey]);

  return { send, retry, discard };
}
