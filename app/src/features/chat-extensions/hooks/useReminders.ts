import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { reminderKeys } from '../api/chat-extensions.keys';
import type { ReminderTab, ReminderView } from '../api/chat-extensions.types';
import { reminderService } from '../api/reminder.service';
import { describeChatExtError } from '../utils/error-info';
import { currentTimeZone, formatWhen } from '../utils/local-time';

const PAGE_SIZE = 30;

/** "Nhắc lại của tôi" theo tab (cursor): Sắp tới (`PENDING`, sớm nhất trước) · Đã nhắc (`FIRED`, mới nhất trước). */
export function useReminders(tab: ReminderTab) {
  return useInfiniteQuery({
    queryKey: reminderKeys.mine(tab),
    queryFn: ({ pageParam }) => reminderService.listMine({ status: tab, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    retry: false,
    staleTime: 15_000,
  });
}

/**
 * Đặt nhắc lại một tin. Lỗi KHÔNG toast: `REMIND_001` dưới ô giờ, `REMIND_002`/`MSG_012` trong tấm — tấm đọc `error`. `MSG_012` (tin không còn đọc được/đã gỡ) là kết luận cuối:
 * tấm tự đóng và báo "Tin không còn khả dụng". Thành công báo giờ nhắc theo GIỜ MÁY.
 */
export function useCreateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, remindAt }: { messageId: string; remindAt: string }) =>
      reminderService.create(messageId, { remindAt, timezone: currentTimeZone() }),
    onSuccess: (view) => {
      void queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      showToast('success', `Sẽ nhắc bạn lúc ${formatWhen(view.remindAt)}`);
    },
  });
}

/** Xoá một lời nhắc. Không lạc quan (thao tác hiếm, 204); xong ⇒ làm mới cả hai tab. */
export function useCancelReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reminder: ReminderView) => reminderService.cancel(reminder.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      showToast('success', 'Đã xoá lời nhắc');
    },
    onError: (error) => showToast('error', describeChatExtError(error).message),
  });
}
