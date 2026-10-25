import { router } from 'expo-router';

import { ActivityWidgetCard, useRefetchOnFocus } from '@/shared/activity-widgets';
import { useFeature } from '@/shell/capabilities';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { useSrSummary } from '../../queries/sr.queries';
import { srDueCount } from '../../utils/sr-due';
import { srReviewHref } from '../../utils/study-routes';
import { lightTap } from '../visual/light-tap';

/**
 * Widget "N thẻ cần ôn hôm nay" ở ĐẦU tab Hoạt động (p4-02 app.md §3 "StudyHome + widget Hoạt động") — đăng ký vào khe
 * `@/shared/activity-widgets` ở `register-activity-widgets.tsx`, nên `features/activity` không import feature này.
 *
 * Dữ liệu là `GET /sr/summary` (chỉ SỐ ĐẾM, cùng khoá cache với `SrDueCard` ở StudyHome) chứ không phải `GET /sr/due`: `due` trả kèm nội dung + đáp án
 * của tối đa 50 thẻ — quá nặng để chỉ vẽ một con số. Ẩn hẳn khi cờ phân hệ `study` tắt/chưa biết (thà hiện muộn còn hơn hiện rồi biến mất, và không gọi
 * API thừa), khi lỗi, hoặc khi hôm nay không còn thẻ nào. Tab được focus lại thì làm mới nếu số đã cũ (`useRefetchOnFocus`).
 */
export function SrDueWidget() {
  const enabled = useFeature('study') === true;
  const summary = useSrSummary(undefined, enabled);
  useRefetchOnFocus(summary, enabled);

  const due = srDueCount(summary.data);
  if (!enabled || !summary.data || due === 0) return null;

  return (
    <ActivityWidgetCard
      actionLabel="Ôn ngay"
      icon={STUDY_MODE_META.sr.icon}
      title={`${due} thẻ cần ôn hôm nay`}
      onAction={() => {
        lightTap();
        router.push(srReviewHref());
      }}
    />
  );
}
