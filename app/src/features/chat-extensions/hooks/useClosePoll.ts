import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatKeys, type ChatScopeRef, type MessagesData } from '@/features/chat';
import { showToast } from '@/shared/utils/toast.utils';

import { pollService } from '../api/poll.service';
import type { PollView } from '../api/chat-extensions.types';
import { describeChatExtError } from '../utils/error-info';
import { mergeServerPoll, patchPollInMessages } from '../utils/poll-cache';

/**
 * Kết thúc khảo sát sớm (người tạo hoặc moderator — BE `AUTH_005` với người khác). KHÔNG lạc quan: kết thúc là thao tác không hoàn tác được và ảnh hưởng mọi người,
 * chờ BE xác nhận (nút loading) rồi mới đổi thẻ. Đã đóng → BE trả nguyên trạng (idempotent) nên bấm hai lần vô hại.
 */
export function useClosePoll(scope: ChatScopeRef, poll: Pick<PollView, 'id' | 'messageId'>) {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.messages(scope);

  return useMutation({
    mutationFn: () => pollService.close(poll.id),
    onSuccess: (server) => {
      queryClient.setQueryData<MessagesData>(queryKey, (data) =>
        patchPollInMessages(data, poll.messageId, (p) => mergeServerPoll(p, server)),
      );
      showToast('success', 'Đã kết thúc khảo sát');
    },
    onError: (error) => showToast('error', describeChatExtError(error).message),
  });
}
