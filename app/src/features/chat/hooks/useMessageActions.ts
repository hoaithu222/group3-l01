import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import { chatKeys } from '../api/chat.keys';
import { chatService } from '../api/chat.service';
import type { ChatScopeRef, MessageMention, MessageView } from '../api/chat.types';
import { patchMessageById, removeMessageById, type MessagesData } from '../cache/message-pages';

export interface UseMessageActionsResult {
  /** `RES_003` (version lệch) → toast + KHÔNG rollback nội dung (app.md §4.5: giữ bản người dùng đang gõ ở `EditStrip`, người gọi tự quyết định gì tiếp). */
  editMessage: (
    messageId: string,
    content: string,
    expectedVersion: number,
    mentions?: MessageMention[],
  ) => Promise<MessageView | undefined>;
  recallMessage: (messageId: string) => Promise<void>;
  hideMessage: (messageId: string) => Promise<void>;
  unhideMessage: (messageId: string) => Promise<void>;
  /** `MSG_010` (đạt trần ghim) → trả `'LIMIT'` để nơi gọi mở sheet "Bỏ ghim tin khác" (app.md §4.5). */
  pinMessage: (messageId: string) => Promise<'OK' | 'LIMIT' | 'ERROR'>;
  unpinMessage: (messageId: string) => Promise<void>;
}

/** Optimistic + rollback theo app.md §4.5 — mỗi hàm tự chụp bản CŨ để khôi phục khi lỗi. */
export function useMessageActions(scope: ChatScopeRef): UseMessageActionsResult {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.messages(scope);

  const withRollback = useCallback(
    async (patch: (data: MessagesData) => MessagesData, run: () => Promise<void>): Promise<boolean> => {
      const previous = queryClient.getQueryData<MessagesData>(queryKey);
      if (previous) queryClient.setQueryData<MessagesData>(queryKey, patch(previous));
      try {
        await run();
        return true;
      } catch (error) {
        if (previous) queryClient.setQueryData<MessagesData>(queryKey, previous);
        showToast('error', toErrorMessage(error));
        return false;
      }
    },
    [queryClient, queryKey],
  );

  const editMessage = useCallback(
    async (
      messageId: string,
      content: string,
      expectedVersion: number,
      mentions?: MessageMention[],
    ): Promise<MessageView | undefined> => {
      const previous = queryClient.getQueryData<MessagesData>(queryKey);
      if (previous) {
        // `mentions` cũng phải vá lạc quan — thiếu thì chip hiện theo danh sách CŨ tới khi socket `message:updated` về.
        queryClient.setQueryData<MessagesData>(
          queryKey,
          patchMessageById(previous, messageId, (m) => ({ ...m, content, mentions: mentions ?? m.mentions })),
        );
      }
      try {
        return await chatService.edit(messageId, { content, expectedVersion, mentions: mentions ?? [] });
      } catch (error) {
        if (isAxiosError(error) && getErrorCode(error) === 'RES_003' && previous) {
          // Máy khác đã sửa trước — hiện bản server, KHÔNG khôi phục bản cũ (app.md §4.5).
          void queryClient.invalidateQueries({ queryKey });
        } else if (previous) {
          queryClient.setQueryData<MessagesData>(queryKey, previous);
        }
        showToast('error', toErrorMessage(error));
        return undefined;
      }
    },
    [queryClient, queryKey],
  );

  const recallMessage = useCallback(
    (messageId: string) =>
      withRollback(
        (data) =>
          patchMessageById(data, messageId, (m) => ({
            ...m,
            deleted: true,
            deletedAt: new Date().toISOString(),
            content: null,
            attachments: [],
            reactions: [],
            pinnedAt: null,
          })),
        () => chatService.recall(messageId).then(() => undefined),
      ).then(() => undefined),
    [withRollback],
  );

  const hideMessage = useCallback(
    (messageId: string) =>
      withRollback((data) => removeMessageById(data, messageId), () => chatService.hide(messageId).then(() => undefined)).then(
        () => undefined,
      ),
    [withRollback],
  );

  const unhideMessage = useCallback(async (messageId: string): Promise<void> => {
    try {
      await chatService.unhide(messageId);
      void queryClient.invalidateQueries({ queryKey }); // app.md §4.4 "false → invalidate scope" — bản gỡ ẩn không nằm sẵn trong cache.
    } catch (error) {
      showToast('error', toErrorMessage(error));
    }
  }, [queryClient, queryKey]);

  const pinMessage = useCallback(async (messageId: string): Promise<'OK' | 'LIMIT' | 'ERROR'> => {
    const previous = queryClient.getQueryData<MessagesData>(queryKey);
    if (previous) {
      queryClient.setQueryData<MessagesData>(
        queryKey,
        patchMessageById(previous, messageId, (m) => ({ ...m, pinnedAt: new Date().toISOString() })),
      );
    }
    try {
      await chatService.pin(messageId);
      void queryClient.invalidateQueries({ queryKey: chatKeys.pins(scope) });
      return 'OK';
    } catch (error) {
      if (previous) queryClient.setQueryData<MessagesData>(queryKey, previous);
      if (isAxiosError(error) && getErrorCode(error) === 'MSG_010') return 'LIMIT';
      showToast('error', toErrorMessage(error));
      return 'ERROR';
    }
  }, [queryClient, queryKey, scope]);

  const unpinMessage = useCallback(
    (messageId: string) =>
      withRollback(
        (data) => patchMessageById(data, messageId, (m) => ({ ...m, pinnedAt: null, pinnedBy: null })),
        () => chatService.unpin(messageId).then(() => {
          void queryClient.invalidateQueries({ queryKey: chatKeys.pins(scope) });
        }),
      ).then(() => undefined),
    [withRollback, queryClient, scope],
  );

  return { editMessage, recallMessage, hideMessage, unhideMessage, pinMessage, unpinMessage };
}
