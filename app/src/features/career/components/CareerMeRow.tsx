import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { CAREER_ICON, CAREER_TONE } from '../constants/career-visuals.constants';
import { CAREER_HREF } from '../utils/career-routes';

/**
 * Hàng "Nghề nghiệp" ở màn Tôi (app.md p6-06 §1) — đăng ký vào khe `@/shared/profile` (`ProfileRowsSlot`) ở `register-profile.tsx`, nên
 * `features/me` không import feature này. Chỉ hiện khi cờ phân hệ `career` bật (chưa biết → ẩn).
 */
export function CareerMeRow() {
  const enabled = useFeature('career') === true;
  if (!enabled) return null;

  return (
    <ListItem
      className="py-xs"
      description="Huy hiệu kỹ năng xác thực và quyền riêng tư nghề nghiệp"
      divider
      label="Nghề nghiệp"
      // Nhận diện riêng của phân hệ (`CAREER_ICON`/`CAREER_TONE`) — trước là ngôi sao, trùng hàng "Thành tích" đứng ngay cạnh ở màn Tôi.
      leading={<IconTile name={CAREER_ICON} tone={CAREER_TONE} />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      onPress={() => router.push(CAREER_HREF)}
    />
  );
}
