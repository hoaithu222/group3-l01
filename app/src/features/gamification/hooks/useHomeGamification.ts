import { useCallback } from 'react';

import { useRefetchOnFocus } from '@/shared/activity-widgets';
import { useFeature } from '@/shell/capabilities';

import { useXpEventsWeek } from '../queries/gamification-week.queries';
import { useMyGamification } from '../queries/gamification.queries';

interface RefetchableQuery {
  isStale: boolean;
  refetch: (options?: { cancelRefetch?: boolean }) => unknown;
}

/**
 * Làm mới khi Trang chủ được focus lại (dữ liệu đã cũ theo `staleTime`) — dùng `useRefetchOnFocus` chung.
 *
 * ⚠️ `cancelRefetch: false`: nhiều widget của Trang chủ cùng đọc `me`/`xp-events week` và cùng gọi hook này. `refetch()`
 * mặc định HUỶ lượt đang bay rồi bắn lượt mới ⇒ hai widget là hai request (lượt đầu vứt đi). Với `false`, lời gọi thứ hai
 * nhập vào lượt đang chạy — một request cho cả nhóm, và widget không phải biết ai "sở hữu" việc làm mới.
 */
function useRefetchOnHomeFocus(query: RefetchableQuery, enabled: boolean): void {
  const { isStale, refetch } = query;
  const refetchShared = useCallback(() => refetch({ cancelRefetch: false }), [refetch]);
  useRefetchOnFocus({ isStale, refetch: refetchShared }, enabled);
}

/** Cờ phân hệ + hồ sơ XP/chuỗi (`me`) — cho widget chỉ cần hồ sơ (cấp độ, thành tích). */
export function useHomeGamificationProfile() {
  const enabled = useFeature('gamification') === true;
  const me = useMyGamification();
  useRefetchOnHomeFocus(me, enabled);
  return { enabled, me };
}

/** Thêm sự kiện XP 7 ngày (`week`) — cho widget chuỗi + biểu đồ hoạt động. */
export function useHomeGamificationWeek() {
  const { enabled, me } = useHomeGamificationProfile();
  const week = useXpEventsWeek();
  useRefetchOnHomeFocus(week, enabled);
  return { enabled, me, week };
}
