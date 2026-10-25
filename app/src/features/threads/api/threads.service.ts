import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { THREADS_API } from './threads.api';
import type {
  ThreadAuthorPage,
  ThreadAuthorSource,
  ThreadChannelBrief,
  ThreadListFilter,
  ThreadListPage,
  ThreadRootResult,
  ThreadSubscriptionResult,
  ThreadSubscriptionState,
} from './threads.types';

const AUTHOR_PAGE_SIZE = 100;

export const threadsService = {
  /**
   * `limit: 1`: màn luồng chỉ lấy `root` + `thread` ở đây — danh sách reply do `<ChatRoom>` tự tải
   * theo scope luồng (`GET /scopes/CHANNEL/:ch/messages?threadId=`), nên không kéo cả trang về hai lần.
   * `skipErrorToast`: màn hình tự dựng trạng thái lỗi (`EmptyState` + Thử lại) — thêm toast là báo hai lần.
   */
  async getByRoot(rootMessageId: string): Promise<ThreadRootResult> {
    const response = await apiClient.get<ThreadRootResult>(THREADS_API.byRoot(rootMessageId), {
      params: { limit: 1 },
      skipErrorToast: true,
    });
    const { root, thread } = unwrapData<ThreadRootResult>(response);
    return { root, thread };
  },

  /**
   * Danh sách luồng của kênh (BE `ThreadService.listByChannel`). ⛔ Đọc `response.data.data` + `.meta` TRỰC TIẾP (không `unwrapData` — vứt `meta` phân trang). `ThreadView` KHÔNG mang nội dung tin gốc:
   * nơi hiện danh sách tra tin gốc riêng (`useThreadByRoot`). `skipErrorToast`: màn tự dựng trạng thái lỗi (`ScreenState` + Thử lại).
   */
  async listByChannel(
    channelId: string,
    params: { filter: ThreadListFilter; cursor?: string; limit?: number },
  ): Promise<ThreadListPage> {
    const response = await apiClient.get<ThreadListPage>(THREADS_API.channelThreads(channelId), {
      params,
      skipErrorToast: true,
    });
    return { data: response.data.data, meta: response.data.meta };
  },

  async setSubscription(
    threadId: string,
    state: Extract<ThreadSubscriptionState, 'EXPLICIT_ON' | 'EXPLICIT_OFF'>,
  ): Promise<ThreadSubscriptionResult> {
    const response = await apiClient.put<ThreadSubscriptionResult>(
      THREADS_API.subscription(threadId),
      { state },
    );
    return unwrapData<ThreadSubscriptionResult>(response);
  },

  /**
   * Danh bạ kênh theo trang — `messages` chỉ trả `authorId`, tên/ảnh phải tra riêng. Gọi thẳng endpoint của
   * `channels` (không import feature đó). Đọc `response.data` trực tiếp: `unwrapData` sẽ vứt `meta` phân trang.
   */
  async listChannelMembers(channelId: string, page: number): Promise<ThreadAuthorPage> {
    const response = await apiClient.get<{
      data: ThreadAuthorSource[];
      meta: { page: number; hasNext: boolean };
    }>(THREADS_API.channelMembers(channelId), {
      params: { page, limit: AUTHOR_PAGE_SIZE },
      skipErrorToast: true,
    });
    const { data, meta } = response.data;
    return {
      items: data.map(({ userId, name, avatarUrl }) => ({
        userId,
        name,
        avatarUrl: avatarUrl ?? null,
      })),
      page: meta.page,
      hasNext: meta.hasNext,
    };
  },

  async getChannelBrief(channelId: string): Promise<ThreadChannelBrief> {
    const response = await apiClient.get<ThreadChannelBrief>(THREADS_API.channel(channelId), {
      skipErrorToast: true,
    });
    const { id, name, myPermissions } = unwrapData<ThreadChannelBrief>(response);
    return { id, name, myPermissions: { canWrite: myPermissions.canWrite } };
  },
};
