import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

import { extractErrorCode } from '@/core/api/error.handler';
import { showErrorToast } from '@/shared/utils/toast.utils';

import { PUSH_TEST_INLINE_ERRORS } from '../constants/notifications.constants';
import type { NotificationStatsRange } from '../types/notification-stats.types';
import { notificationsConfigService } from './notifications-config.service';

/** Cùng gốc `['system-config']` với `systemConfigKeys` — lưu cấu hình ở tab khác làm mới luôn tab này. */
export const notificationsConfigKeys = {
  status: () => ['system-config', 'notifications', 'status'] as const,
  stats: () => ['system-config', 'notifications', 'stats'] as const,
  /** p1-07 — số liệu thông báo tin nhắn gộp, theo khoảng `24h`/`7d`. */
  messageStats: (range: NotificationStatsRange) =>
    ['system-config', 'notifications', 'message-stats', range] as const,
};

/** Trạng thái provider chỉ đổi khi deploy — không cần làm mới liên tục. */
const STATUS_STALE_MS = 5 * 60_000;
/** BE cache số liệu 60 giây; hỏi lại sớm hơn chỉ trả đúng bản cũ. */
const STATS_STALE_MS = 60_000;

export const usePushProviderStatus = () =>
  useQuery({
    queryKey: notificationsConfigKeys.status(),
    queryFn: () => notificationsConfigService.providerStatus(),
    select: (res) => res.data,
    staleTime: STATUS_STALE_MS,
  });

export const usePushStats = () =>
  useQuery({
    queryKey: notificationsConfigKeys.stats(),
    queryFn: () => notificationsConfigService.stats(),
    select: (res) => res.data,
    staleTime: STATS_STALE_MS,
  });

/**
 * Số liệu thông báo tin nhắn gộp (p1-07) — đổi khoảng 24h/7d giữ số cũ tới khi số mới về.
 * Bộ đếm Redis cập nhật liên tục nhưng trang chỉ cần cỡ phút: `staleTime` 60 giây như số liệu push.
 */
export const useNotificationStats = (range: NotificationStatsRange) =>
  useQuery({
    queryKey: notificationsConfigKeys.messageStats(range),
    queryFn: () => notificationsConfigService.messageStats(range),
    select: (res) => res.data,
    staleTime: STATS_STALE_MS,
    placeholderData: keepPreviousData,
  });

/**
 * Gửi push thử. `PUSH_001`/`PUSH_002` KHÔNG toast — panel hiện chúng ngay tại chỗ
 * (đọc từ `error` của mutation); lỗi khác (VAL_001, 403, mạng…) toast như thường.
 * Thành công thì làm mới nhật ký (`system.push-test` vừa được ghi).
 */
export const useSendPushTest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsConfigService.pushTest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['audit-log'] });
    },
    onError: (err) => {
      if (PUSH_TEST_INLINE_ERRORS.has(extractErrorCode(err as AxiosError))) return;
      showErrorToast(err, 'Không gửi được push thử');
    },
  });
};
