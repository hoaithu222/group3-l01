import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { usePendingReviewCount } from '../../hooks/usePendingReviewCount';
import { MY_REVIEWS_HREF } from '../../utils/review-routes';

/**
 * Hàng "Cần chấm" ở màn Tôi (p4-05 app.md §1) kèm số thẻ đang chờ bạn chấm — đăng ký vào khe `@/shared/profile` (`ProfileRowsSlot`) ở
 * `register-profile.tsx`, nên `features/me` không import feature này. Chỉ hiện khi cờ phân hệ `project` bật (chưa biết → ẩn). Số đếm lấy từ
 * TRANG ĐẦU của `GET /me/reviews?status=PENDING` (`staleTime` 60 giây, tự làm mới khi có thông báo `review.*`): đủ một trang thì ghi "20+" —
 * không đếm chính xác hơn vì không tải hết danh sách chỉ để vẽ một con số.
 */
export function MyReviewsMeRow() {
  const enabled = useFeature('project') === true;
  const { count, label } = usePendingReviewCount(enabled);
  if (!enabled) return null;

  return (
    <ListItem
      className="py-xs"
      description="Thẻ bạn được giao chấm chéo và thẻ đã chấm"
      divider
      label="Cần chấm"
      leading={<IconTile name="checkmark-square" tone="info" />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      value={count > 0 ? <Badge accessibilityLabel={`${label} thẻ đang chờ bạn chấm`} label={label} variant="error" /> : undefined}
      onPress={() => router.push(MY_REVIEWS_HREF)}
    />
  );
}
