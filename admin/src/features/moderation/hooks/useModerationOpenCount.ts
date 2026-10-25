import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/app/store';
import { SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';

import { moderationKeys } from '../service/moderation.queries';
import { moderationService } from '../service/moderation.service';

/** Phòng Socket.IO của hàng đợi kiểm duyệt — cùng phòng `useModerationSocket` (refcount ở `useRoomSubscription`). */
const ROOM_KIND = 'admin';
const ROOM_ID = 'moderation';

/** Sự kiện đã báo hiệu thì refetch ngay; `staleTime` chỉ để các lần mount lại không gọi thừa. */
const STALE_MS = 30_000;

/**
 * Số NHÓM báo cáo đang chờ xử lý — nguồn của chấm số ở menu (`ModuleConfig.badge = 'moderation-open'`).
 *
 * Chỉ chạy khi `enabled` (module `moderation` đang hiện ở menu: đủ quyền, cờ `communication` bật) VÀ có
 * `moderation:view`. Realtime: vào phòng `admin:moderation` và refetch khi `moderation:report-created|updated`;
 * sự kiện không kèm dữ liệu nên chỉ là tín hiệu. Chỉ làm mới khoá `openCount` — KHÔNG đụng danh sách/chi tiết/
 * nội dung (đó là việc của `useModerationSocket` ở màn đang mở; xem `refreshModeration`).
 *
 * Trả `undefined` khi chưa biết (đang tải / lỗi / bị tắt) — menu không hiện chấm thay vì hiện `0` giả.
 */
export function useModerationOpenCount(enabled: boolean): number | undefined {
  const queryClient = useQueryClient();
  const canView = useAuthStore((s) => s.hasPermission('moderation', 'view'));
  const active = enabled && canView;

  useRoomSubscription(ROOM_KIND, ROOM_ID, { enabled: active });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: moderationKeys.openCount() });
  useSocketEvent(SocketEvent.MODERATION_REPORT_CREATED, refresh);
  useSocketEvent(SocketEvent.MODERATION_REPORT_UPDATED, refresh);

  const { data } = useQuery({
    queryKey: moderationKeys.openCount(),
    queryFn: moderationService.openCount,
    enabled: active,
    staleTime: STALE_MS,
  });

  return active ? (data ?? undefined) : undefined;
}
