import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatKeys, type ChatScopeRef, type MessagesData } from '@/features/chat';
import { showToast } from '@/shared/utils/toast.utils';

import { pollService } from '../api/poll.service';
import type { PollView } from '../api/chat-extensions.types';
import { describeChatExtError } from '../utils/error-info';
import { findPoll, mergeServerPoll, patchPollInMessages, withMyVote } from '../utils/poll-cache';

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

export interface VoteVars {
  /** Lựa chọn MỚI của mình; rỗng = bỏ phiếu. */
  nextIds: string[];
}

/**
 * Bầu/đổi/bỏ phiếu của MỘT khảo sát — LẠC QUAN (`onMutate` đặt lựa chọn của mình + đếm ngay, thẻ không chờ mạng), lỗi thì hoàn lại.
 *
 *  · `scope` (TanStack mutation scope) xếp các lượt của CÙNG khảo sát nối đuôi: chạm nhanh chọn-nhiều A rồi B ra hai `PUT` theo đúng thứ tự, lượt sau thắng — không
 *    hai request đua nhau. `onMutate` vẫn chạy NGAY nên lần chạm kế đọc đúng trạng thái lạc quan của lần trước.
 *  · Hoàn lại CHỈ khi lựa chọn hiện tại vẫn là bản lạc quan của lượt này — nếu người dùng đã chạm tiếp thì lượt sau lo trạng thái, hoàn ở đây là xoá nhầm ý họ.
 *  · Thành công ghi bản SERVER (có `version`, `myOptionIds` chuẩn) — nhưng bỏ qua khi còn lượt khác đang bay (bản của lượt này đã cũ so với lựa chọn hiện tại).
 *  · `POLL_004` (đã kết thúc) ⇒ hoàn lại rồi đánh dấu thẻ ĐÃ ĐÓNG; `POLL_005`/404 ⇒ nơi gọi đọc `error` để hiện "Khảo sát không còn khả dụng".
 */
export function usePollVote(scope: ChatScopeRef, poll: Pick<PollView, 'id' | 'messageId'>) {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.messages(scope);
  const mutationKey = ['chat-ext', 'poll-vote', poll.id] as const;
  const patch = (fn: (p: PollView) => PollView) =>
    queryClient.setQueryData<MessagesData>(queryKey, (data) => patchPollInMessages(data, poll.messageId, fn));
  const current = () => findPoll(queryClient.getQueryData<MessagesData>(queryKey), poll.messageId);

  return useMutation({
    mutationKey,
    scope: { id: `chat-ext-poll:${poll.id}` },
    mutationFn: ({ nextIds }: VoteVars) =>
      nextIds.length === 0 ? pollService.unvote(poll.id) : pollService.vote(poll.id, nextIds),
    onMutate: ({ nextIds }) => {
      const previous = current()?.myOptionIds ?? [];
      patch((p) => withMyVote(p, nextIds));
      return { previous };
    },
    onError: (error, { nextIds }, context) => {
      const info = describeChatExtError(error);
      if (context && sameSet(current()?.myOptionIds ?? [], nextIds)) {
        patch((p) => withMyVote(p, context.previous));
      }
      if (info.code === 'POLL_004') {
        patch((p) => ({ ...p, status: 'CLOSED', canClose: false, closeReason: p.closeReason ?? 'EXPIRED' }));
      }
      showToast('error', info.message);
    },
    onSuccess: (server) => {
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      patch((p) => mergeServerPoll(p, server));
    },
  });
}
