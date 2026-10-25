import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { onRoomResync, useSocketEvent } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { CHAT_EXT_EVENTS } from '../api/chat-extensions.api';
import { scheduledKeys } from '../api/chat-extensions.keys';
import type {
  ChatScopeInput,
  CreateScheduledInput,
  ScheduledTab,
  ScheduledUpdatedEvent,
} from '../api/chat-extensions.types';
import { scheduledMessageService } from '../api/scheduled-message.service';
import { describeChatExtError } from '../utils/error-info';
import { formatWhen } from '../utils/local-time';

type ScopeRef = Pick<ChatScopeInput, 'scopeType' | 'scopeId'>;

/** Số dòng mỗi trang; và trần đếm cho banner — mỗi người ≤ `pendingPerUserMax` (50) tin đang chờ nên 50 trang đủ đếm trọn mà không cần API đếm riêng. */
const PAGE_SIZE = 30;
const COUNT_LIMIT = 50;

/**
 * Danh sách "Tin đã hẹn của tôi" theo tab (cursor). `scope` vắng = mọi phòng. Đang chờ: sắp phát sớm nhất trước; còn lại: mới nhất trước (BE sắp).
 * `retry: false` — lỗi hiện NGAY (Thử lại), không đợi ba lượt.
 */
export function useScheduledMessages(tab: ScheduledTab, scope?: ScopeRef) {
  return useInfiniteQuery({
    queryKey: scheduledKeys.mine(tab, scope),
    queryFn: ({ pageParam }) =>
      scheduledMessageService.listMine({ status: tab, cursor: pageParam, limit: PAGE_SIZE, ...scope }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    retry: false,
    staleTime: 15_000,
  });
}

/**
 * Số tin ĐANG CHỜ của một phòng (banner "N tin đã hẹn"). `enabled` theo cờ phụ: cờ tắt ⇒ không gọi API (BE trả 404 `CFG_005`).
 * Lỗi/đang tải ⇒ `undefined` — banner ẩn (giữ ô soạn gọn), không hiện "0".
 */
export function useScheduledCount(scope: ScopeRef, enabled: boolean) {
  return useQuery({
    queryKey: scheduledKeys.count(scope),
    enabled,
    queryFn: () => scheduledMessageService.listMine({ status: 'PENDING', limit: COUNT_LIMIT, ...scope }),
    select: (page) => ({ count: page.data.length, more: page.meta.hasMore }),
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * `scheduled-message:updated` (`user:{id}`, đa thiết bị): tạo/sửa/huỷ/phát/lỗi ⇒ làm mới MỌI danh sách + số đếm (payload không có nội dung để vá tại chỗ). Tin đã phát KHÔNG cần
 * làm gì thêm — nó về phòng chat qua `message:created` như tin thường. Nối lại socket/phòng ⇒ làm mới luôn (sự kiện lỡ không phát lại).
 */
export function useScheduledSocket(): void {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: scheduledKeys.all });
  useSocketEvent<ScheduledUpdatedEvent>(CHAT_EXT_EVENTS.SCHEDULED_MESSAGE_UPDATED, refresh);
  useEffect(
    () => onRoomResync(() => void queryClient.invalidateQueries({ queryKey: scheduledKeys.all })),
    [queryClient],
  );
}

/**
 * Hẹn giờ gửi nội dung đang soạn. Lỗi KHÔNG toast: `SCHED_001` hiện dưới ô giờ, `SCHED_002`/`MSG_004` trong tấm — tấm đọc `error` của mutation. Thành công: làm mới danh sách/số đếm
 * và báo giờ đã chốt theo GIỜ MÁY ("Đã hẹn gửi lúc 20:00 Thứ hai 21/09").
 */
export function useScheduleMessage(scope: ChatScopeInput) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduledInput) => scheduledMessageService.create(scope, input),
    onSuccess: (view) => {
      void queryClient.invalidateQueries({ queryKey: scheduledKeys.all });
      showToast('success', `Đã hẹn gửi lúc ${formatWhen(view.sendAt)}`);
    },
  });
}

/** Toast lỗi của thao tác trên danh sách — TRỪ lỗi thuộc ô thời gian (tấm chọn giờ hiện tại chỗ). Bản ghi đã đổi/biến mất ⇒ tải lại danh sách. */
export function useScheduledFailure(): (error: unknown) => void {
  const queryClient = useQueryClient();
  return (error) => {
    const info = describeChatExtError(error);
    if (!info.timeField) showToast('error', info.message);
    if (info.stale || info.gone) void queryClient.invalidateQueries({ queryKey: scheduledKeys.all });
  };
}
