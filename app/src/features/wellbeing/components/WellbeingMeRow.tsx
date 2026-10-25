import { router } from 'expo-router';

import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { useWellbeingEnabled } from '../hooks/useWellbeingEnabled';
import { WELLBEING_HREF } from '../utils/wellbeing-routes';

/**
 * Hàng "Sức khoẻ học tập" ở màn Tôi (app.md p7-03 §1) — đăng ký vào khe `@/shared/profile` ở `register-profile.tsx`, nên `features/me` không import feature này.
 * Chỉ hiện khi cờ `burnout` bật (chưa biết → ẩn). ⚠️ Hàng cố ý KHÔNG hiện trạng thái ("Đang bật") hay mức đánh giá: màn Tôi là màn dễ bị người bên cạnh liếc thấy, và việc
 * bạn có đang theo dõi hay không là thông tin của riêng bạn. Cũng vì vậy hàng không gọi API nào — chỉ mở màn Sức khoẻ, nơi mới tải dữ liệu.
 */
export function WellbeingMeRow() {
  const enabled = useWellbeingEnabled();
  if (!enabled) return null;

  return (
    <ListItem
      className="py-xs"
      description="Riêng tư, chỉ bạn thấy. Bạn tự chọn bật hoặc tắt."
      divider
      label="Sức khoẻ học tập"
      leading={<IconTile name="favorite" tone="success" />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      onPress={() => router.push(WELLBEING_HREF)}
    />
  );
}
