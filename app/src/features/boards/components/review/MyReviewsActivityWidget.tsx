import { router } from 'expo-router';

import { ActivityWidgetCard, useRefetchOnFocus } from '@/shared/activity-widgets';
import { useFeature } from '@/shell/capabilities';

import { usePendingReviewCount } from '../../hooks/usePendingReviewCount';
import { MY_REVIEWS_HREF } from '../../utils/review-routes';

/**
 * Thẻ "N thẻ cần chấm" ở ĐẦU tab Hoạt động (p4-05 app.md §1 "tab Hoạt động hiện thẻ …") — đăng ký vào khe `@/shared/activity-widgets` ở
 * `register-activity-widgets.tsx`, nên `features/activity` không import `boards`. Chạm "Chấm ngay" mở "Cần chấm của tôi" (`me/reviews`).
 *
 * Ẩn hẳn khi cờ phân hệ `project` tắt/chưa biết (không gọi API), khi lỗi, hoặc khi không có thẻ nào chờ. Số đếm là trang đầu của `GET /me/reviews`
 * (đủ một trang còn trang sau → "20+", xem `usePendingReviewCount`); tab được focus lại thì làm mới nếu số đã cũ.
 */
export function MyReviewsActivityWidget() {
  const enabled = useFeature('project') === true;
  const { count, label, query } = usePendingReviewCount(enabled);
  useRefetchOnFocus(query, enabled);

  if (!enabled || count === 0) return null;

  return (
    <ActivityWidgetCard
      actionLabel="Chấm ngay"
      description="Thẻ được giao cho bạn chấm chéo"
      icon="checkmark-square"
      title={`${label} thẻ cần chấm`}
      onAction={() => router.push(MY_REVIEWS_HREF)}
    />
  );
}
