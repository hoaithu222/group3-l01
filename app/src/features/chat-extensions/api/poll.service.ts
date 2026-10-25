import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';
import type { MessageView } from '@/features/chat';

import { retryWhenBusy } from '../utils/retry-busy';
import { chatExtPaths } from './chat-extensions.api';
import type {
  ChatScopeInput,
  CreatePollInput,
  PollView,
  VotersPage,
} from './chat-extensions.types';

/**
 * ⛔ Mọi request dùng `skipErrorToast`: lỗi `POLL_*` được feature này hiện bằng câu của NGỮ CẢNH (`utils/error-info.ts`) — để interceptor toast thì hiện nguyên văn BE và
 * toast hai lần. Danh sách người bầu đọc `response.data.data` + `.meta` TRỰC TIẾP, không `unwrapData` (bóc `.data` và vứt `meta` — cùng bẫy `chatService.list`).
 */
export const pollService = {
  /** 201 `MessageView` (`kind = 'POLL'`, đã kèm `poll`); replay cùng `clientMessageId` → 200 cùng nội dung. */
  async create(scope: ChatScopeInput, input: CreatePollInput): Promise<MessageView> {
    const response = await apiClient.post<MessageView>(
      chatExtPaths.scopePolls(scope.scopeType, scope.scopeId),
      {
        clientMessageId: input.clientMessageId,
        question: input.question,
        options: input.options,
        multi: input.multi,
        anonymous: input.anonymous,
        ...(input.closesAt ? { closesAt: input.closesAt } : {}),
        // `threadId` của BE = id TIN GỐC của luồng (chỉ kênh) — chính là `threadId` của scope chat.
        ...(scope.scopeType === 'CHANNEL' && scope.threadId ? { threadId: scope.threadId } : {}),
      },
      { skipErrorToast: true },
    );
    return unwrapData<MessageView>(response);
  },

  async get(pollId: string): Promise<PollView> {
    const response = await apiClient.get<PollView>(chatExtPaths.poll(pollId), { skipErrorToast: true });
    return unwrapData<PollView>(response);
  },

  /** `PUT` THAY TOÀN BỘ lựa chọn của mình. Bận (503, nhóm đông) → thử lại vài lượt có jitter (`retryWhenBusy`) rồi mới ném lỗi. */
  async vote(pollId: string, optionIds: string[]): Promise<PollView> {
    return retryWhenBusy(async () => {
      const response = await apiClient.put<PollView>(
        chatExtPaths.pollVote(pollId),
        { optionIds },
        { skipErrorToast: true },
      );
      return unwrapData<PollView>(response);
    });
  },

  async unvote(pollId: string): Promise<PollView> {
    return retryWhenBusy(async () => {
      const response = await apiClient.delete<PollView>(chatExtPaths.pollVote(pollId), {
        skipErrorToast: true,
      });
      return unwrapData<PollView>(response);
    });
  },

  /** Đã đóng → BE trả nguyên trạng (idempotent). */
  async close(pollId: string): Promise<PollView> {
    const response = await apiClient.post<PollView>(chatExtPaths.pollClose(pollId), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<PollView>(response);
  },

  /** `POLL_006` (403) với khảo sát ẩn danh — kể cả người tạo. */
  async voters(
    pollId: string,
    params: { optionId: string; cursor?: string; limit?: number },
  ): Promise<VotersPage> {
    const response = await apiClient.get<VotersPage>(chatExtPaths.pollVoters(pollId), {
      params,
      skipErrorToast: true,
    });
    return { data: response.data.data, meta: response.data.meta };
  },
};
