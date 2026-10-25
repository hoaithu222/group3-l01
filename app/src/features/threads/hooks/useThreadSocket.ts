import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import type { MessageMention, ThreadUpdatedEvent } from '@/features/chat';

import type { ThreadRootResult, ThreadSubscriptionUpdatedEvent } from '../api';
import { threadKeys } from '../queries/threads.keys';
import {
  applyRootDeleted,
  applyRootUpdated,
  applySubscriptionUpdated,
  applyThreadUpdatedToRoot,
} from '../utils/thread-cache';

interface RootUpdatedEvent {
  id: string;
  content: string | null;
  mentions: MessageMention[];
  editedAt: string;
  version: number;
}

/**
 * Đồng bộ realtime cho MỘT màn luồng: số phản hồi (`thread:updated`), trạng thái theo dõi từ máy khác
 * (`thread:subscription-updated`), và việc tin gốc bị sửa/thu hồi trong lúc màn đang mở.
 * Tin reply mới KHÔNG xử lý ở đây — `<ChatRoom>` đã lo qua `message:created` (scope luồng).
 */
export function useThreadSocket(rootId: string): void {
  const queryClient = useQueryClient();
  const key = threadKeys.byRoot(rootId);

  useSocketEvent<ThreadUpdatedEvent>(SocketEvent.THREAD_UPDATED, (event) => {
    if (event.parentMessageId !== rootId) return;
    const current = queryClient.getQueryData<ThreadRootResult>(key);
    // Reply ĐẦU TIÊN vừa tạo luồng: cache còn `thread: null`, thiếu `threadId`/`mySubscription` → tải lại đủ.
    if (current && current.thread === null) {
      void queryClient.invalidateQueries({ queryKey: key });
      return;
    }
    queryClient.setQueryData<ThreadRootResult>(key, (data) =>
      applyThreadUpdatedToRoot(data, event),
    );
  });

  useSocketEvent<ThreadSubscriptionUpdatedEvent>(
    SocketEvent.THREAD_SUBSCRIPTION_UPDATED,
    (event) => {
      queryClient.setQueryData<ThreadRootResult>(key, (data) =>
        applySubscriptionUpdated(data, event),
      );
    },
  );

  useSocketEvent<RootUpdatedEvent>(SocketEvent.MESSAGE_UPDATED, (event) => {
    queryClient.setQueryData<ThreadRootResult>(key, (data) => applyRootUpdated(data, event));
  });

  useSocketEvent<{ id: string; deletedAt: string }>(SocketEvent.MESSAGE_DELETED, (event) => {
    queryClient.setQueryData<ThreadRootResult>(key, (data) => applyRootDeleted(data, event));
  });
}
