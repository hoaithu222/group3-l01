import { useMyReviews } from '../queries/reviews.queries';
import { useReviewInboxRealtime } from './useReviewRealtime';

/**
 * Số thẻ đang chờ BẠN chấm (p4-05 app.md §4 "Số đếm"): TRANG ĐẦU của `GET /me/reviews?status=PENDING` (`staleTime` 60 giây, tự làm mới khi có thông
 * báo `review.*`). Đủ một trang mà còn trang sau thì ghi "20+" — không tải hết danh sách chỉ để vẽ một con số. Dùng chung cho hàng "Cần chấm" ở màn Tôi
 * (`MyReviewsMeRow`) và widget ở tab Hoạt động (`MyReviewsActivityWidget`) để hai nơi không lệch số. `enabled = false` (cờ `project` tắt) ⇒ không gọi API.
 */
export function usePendingReviewCount(enabled: boolean) {
  const query = useMyReviews('PENDING', { enabled });
  useReviewInboxRealtime();

  const firstPage = query.data?.pages[0];
  const count = firstPage?.items.length ?? 0;
  const more = Boolean(firstPage?.nextCursor);
  return { count, label: more ? `${count}+` : String(count), query };
}
