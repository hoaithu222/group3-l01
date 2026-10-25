import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminNotificationStats,
  NotificationStatsRange,
} from '../types/notification-stats.types';
import type {
  PushProviderStatus,
  PushStats,
  PushTestPayload,
  PushTestResult,
  UserLookupRow,
  UserOption,
} from '../types/notifications-config.types';
import { notificationsConfigApi } from './notifications-config.api';

/** Số gợi ý tối đa cho ô chọn người nhận — đủ để chọn, không kéo cả danh bạ. */
const USER_LOOKUP_LIMIT = 20;

/**
 * Service THUẦN. `pushTest` tắt toast lỗi tự động: `PUSH_001`/`PUSH_002` hiện
 * ngay trong panel (tiếng Việt, kèm gợi ý) — hook (`notifications-config.queries.ts`)
 * tự toast các lỗi còn lại.
 */
export const notificationsConfigService = {
  providerStatus: async (): Promise<ApiResponse<PushProviderStatus>> =>
    (await apiClient.get<ApiResponse<PushProviderStatus>>(notificationsConfigApi.providerStatus))
      .data,

  stats: async (): Promise<ApiResponse<PushStats>> =>
    (await apiClient.get<ApiResponse<PushStats>>(notificationsConfigApi.stats)).data,

  /** Số liệu thông báo tin nhắn gộp (p1-07) theo khoảng `24h`/`7d`. */
  messageStats: async (
    range: NotificationStatsRange,
  ): Promise<ApiResponse<AdminNotificationStats>> =>
    (
      await apiClient.get<ApiResponse<AdminNotificationStats>>(
        notificationsConfigApi.messageStats,
        {
          params: { range },
        },
      )
    ).data,

  pushTest: async (payload: PushTestPayload): Promise<ApiResponse<PushTestResult>> =>
    (
      await apiClient.post<ApiResponse<PushTestResult>>(notificationsConfigApi.pushTest, payload, {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  /**
   * Gợi ý người nhận theo `q` (BE tìm không phân biệt dấu). Chỉ tài khoản
   * `ACTIVE` — tài khoản khoá/ẩn danh không có thiết bị nào để thử. `q` rỗng thì
   * bỏ hẳn tham số (BE từ chối `q=""`).
   */
  searchUsers: async (q: string): Promise<UserOption[]> => {
    const keyword = q.trim();
    const res = await apiClient.get<ApiResponse<UserLookupRow[]>>(notificationsConfigApi.users, {
      params: { q: keyword || undefined, status: 'ACTIVE', limit: USER_LOOKUP_LIMIT },
    });
    return res.data.data.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }));
  },
};
