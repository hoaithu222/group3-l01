import { useQuery } from '@tanstack/react-query';

import { pomodoroKeys } from '../../api/pomodoro.keys';
import { pomodoroService } from '../../api/pomodoro.service';
import { collectHistorySince, weekWindowStart } from './week-focus';

/** BE cho tối đa 100 dòng/trang (`LIMITS.pagination.max`); 50 là đủ phủ một tuần học bình thường trong 1 request. */
const PAGE_SIZE = 50;
/** Trần số trang một lần làm mới — một tuần vượt 200 lượt phiên là bất thường, không đáng bắn thêm request. */
const MAX_PAGES = 4;

/**
 * Lượt phiên Pomodoro của 7 ngày gần nhất cho widget "Giờ tập trung" ở Trang chủ.
 *
 * ⚠️ Không dùng `usePomodoroHistory` (infinite, 20 dòng/trang, cùng khoá với màn Lịch sử): làm mới một `useInfiniteQuery`
 * tải lại MỌI trang đã cuộn, nên nếu người dùng vừa cuộn hết lịch sử thì widget này sẽ kéo cả lịch sử mỗi lần focus. Query
 * riêng có khoá con `['pomodoro','history','week']` (vẫn nằm dưới `pomodoroKeys.history()` nên bị làm mới cùng khi lịch
 * sử đổi) và chỉ tải tới hết cửa sổ. `enabled` = cờ phân hệ `pomodoro` bật (cờ tắt BE trả 404 — không gọi).
 * `retry: false`: widget lỗi thì ẩn, không đáng thử lại trên Trang chủ.
 */
export function useWeeklyFocus(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () =>
      collectHistorySince(
        (cursor) => pomodoroService.history(cursor, PAGE_SIZE),
        weekWindowStart(new Date()),
        MAX_PAGES,
      ),
    queryKey: [...pomodoroKeys.history(), 'week'] as const,
    retry: false,
    staleTime: 60_000,
  });
}
