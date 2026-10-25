import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';
import type { MessageView } from '@/features/chat';

import { chatExtPaths } from './chat-extensions.api';
import type {
  ChatScopeInput,
  CreateScheduledInput,
  ScheduledMessageView,
  ScheduledPage,
  ScheduledTab,
  UpdateScheduledInput,
} from './chat-extensions.types';

export interface ListScheduledParams {
  status: ScheduledTab;
  cursor?: string;
  limit?: number;
  scopeType?: ChatScopeInput['scopeType'];
  scopeId?: string;
}

/**
 * Tin hẹn giờ (BE `scheduled-message.controller.ts`). ⛔ `skipErrorToast` cho mọi request — lỗi `SCHED_*` do feature hiện (dưới ô giờ / trong tấm), không toast hai lần.
 * ⛔ Danh sách đọc `response.data.data` + `.meta` TRỰC TIẾP (không `unwrapData` — sẽ vứt `meta`).
 */
export const scheduledMessageService = {
  /** 201. `sendAt` = ISO UTC trong `[+minLead, +sendAtMaxDays]`; `timezone` = IANA của máy (chỉ để hiển thị). */
  async create(scope: ChatScopeInput, input: CreateScheduledInput): Promise<ScheduledMessageView> {
    const { content, threadId, replyToId, ...rest } = input;
    const response = await apiClient.post<ScheduledMessageView>(
      chatExtPaths.scopeScheduled(scope.scopeType, scope.scopeId),
      {
        ...rest,
        ...(content ? { content } : {}),
        ...(replyToId ? { replyToId } : {}),
        ...(scope.scopeType === 'CHANNEL' && (threadId ?? scope.threadId)
          ? { threadId: threadId ?? scope.threadId }
          : {}),
      },
      { skipErrorToast: true },
    );
    return unwrapData<ScheduledMessageView>(response);
  },

  async listMine(params: ListScheduledParams): Promise<ScheduledPage> {
    const response = await apiClient.get<ScheduledPage>(chatExtPaths.myScheduled, {
      params,
      skipErrorToast: true,
    });
    return { data: response.data.data, meta: response.data.meta };
  },

  /** Chỉ khi còn `PENDING`; `expectedVersion` lệch → `RES_003`, đã gửi/huỷ → `SCHED_003`. */
  async update(id: string, input: UpdateScheduledInput): Promise<ScheduledMessageView> {
    const response = await apiClient.patch<ScheduledMessageView>(chatExtPaths.scheduled(id), input, {
      skipErrorToast: true,
    });
    return unwrapData<ScheduledMessageView>(response);
  },

  /** 204; đã huỷ → BE trả yên lặng (idempotent). */
  async cancel(id: string): Promise<void> {
    await apiClient.delete(chatExtPaths.scheduled(id), { skipErrorToast: true });
  },

  /** `{ scheduledMessage, message }`; mất quyền gửi → 403 `SCHED_004` (bản ghi giữ `PENDING`). */
  async sendNow(id: string): Promise<{ scheduledMessage: ScheduledMessageView; message: MessageView }> {
    const response = await apiClient.post<{ scheduledMessage: ScheduledMessageView; message: MessageView }>(
      chatExtPaths.scheduledSendNow(id),
      undefined,
      { skipErrorToast: true },
    );
    return unwrapData(response);
  },
};
