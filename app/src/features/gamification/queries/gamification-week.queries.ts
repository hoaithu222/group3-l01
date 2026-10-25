import { useQuery } from '@tanstack/react-query';

import { useFeature } from '@/shell/capabilities';

import { gamificationService } from '../api/gamification.service';
import { weekWindowStart } from '../utils/xp-week';
import { collectXpEventsSince, XP_WEEK_PAGE_SIZE } from '../utils/xp-week-fetch';
import { gamificationKeys } from './gamification.keys';

/**
 * Sự kiện XP của 7 ngày gần nhất, gom nhiều trang trong MỘT query (`collectXpEventsSince`) — nguồn của "Hoạt động 7 ngày"
 * và dải chấm chuỗi ở Trang chủ. Không dùng `useXpEvents`: hook đó lấy 20 dòng/trang cho màn Lịch sử, còn ở đây cần
 * "tất cả trong tuần" (mỗi thẻ ôn là một sự kiện, 20 dòng chưa phủ hết một ngày). Chỉ gọi khi cờ `gamification` BẬT (cờ tắt
 * BE trả 404; chưa biết cờ = chưa gọi). `retry: false` vì widget lỗi thì ẩn, không đáng thử lại trên Trang chủ.
 *
 * Khoá `xpEventsWeek()` nằm dưới `xpEvents()` nên bị làm mới cùng khi lịch sử XP đổi. Tách khỏi `gamification.queries.ts` vì
 * file đó đã chạm trần độ dài.
 */
export function useXpEventsWeek() {
  const enabled = useFeature('gamification') === true;
  return useQuery({
    enabled,
    queryFn: () =>
      collectXpEventsSince(
        (cursor) => gamificationService.xpEvents({ cursor, limit: XP_WEEK_PAGE_SIZE }),
        weekWindowStart(new Date()),
      ),
    queryKey: gamificationKeys.xpEventsWeek(),
    retry: false,
    staleTime: 60_000,
  });
}
