import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { notificationKeys } from '@/core/notifications';
import {
  INBOX_INVALIDATE_DEBOUNCE_MS,
  SUMMARY_INVALIDATE_DEBOUNCE_MS,
} from '@/shared/notifications/notifications.constants';

export type RefreshGroup = 'inbox' | 'summary';

/**
 * Gộp nhiều sự kiện dồn dập thành MỘT lần `invalidate` cho mỗi nhóm khoá (p1-07 `app.md` §4.3): `summary` = tóm tắt chưa
 * đọc + số theo workspace, `inbox` = mọi danh sách hộp thư. Timer dọn khi unmount.
 */
export function useRefreshSoon(): (group: RefreshGroup) => void {
  const queryClient = useQueryClient();
  const timers = useRef(new Map<RefreshGroup, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return useCallback(
    (group) => {
      if (timers.current.has(group)) return;
      const delay = group === 'inbox' ? INBOX_INVALIDATE_DEBOUNCE_MS : SUMMARY_INVALIDATE_DEBOUNCE_MS;
      timers.current.set(
        group,
        setTimeout(() => {
          timers.current.delete(group);
          if (group === 'inbox') {
            void queryClient.invalidateQueries({ queryKey: notificationKeys.inboxAll });
          } else {
            void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
            void queryClient.invalidateQueries({ queryKey: notificationKeys.workspaceUnreadAll });
          }
        }, delay),
      );
    },
    [queryClient],
  );
}
