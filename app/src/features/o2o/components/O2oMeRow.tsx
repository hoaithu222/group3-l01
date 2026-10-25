import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { O2O_MAP_HREF } from '../utils/o2o-routes';

/**
 * Hàng "Địa điểm & in ấn" ở màn Tôi (app.md §1 "Điểm vào: tab me") — đăng ký vào khe `@/shared/profile` ở `register-profile.tsx`, nên `features/me`
 * không import feature này. Chỉ hiện khi cờ phân hệ `o2o` bật (chưa biết → ẩn, khác thanh tab: hàng này không cần "nháy" hiện tạm).
 */
export function O2oMeRow() {
  const enabled = useFeature('o2o') === true;
  if (!enabled) return null;

  return (
    <ListItem
      className="py-xs"
      description="Tìm quán cà phê, thư viện, tiệm in và đặt in tài liệu"
      divider
      label="Địa điểm & in ấn"
      // Cùng icon + tông với ô "Địa điểm & in ấn" ở Trang chủ (`module-registry`: `store-location` · success) — một phân hệ, một nhận diện.
      leading={<IconTile name="store-location" tone="success" />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      onPress={() => router.push(O2O_MAP_HREF)}
    />
  );
}
