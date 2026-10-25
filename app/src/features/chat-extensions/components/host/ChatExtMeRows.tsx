import { router } from 'expo-router';

import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { useChatSubFeatures } from '../../hooks/useChatSubFeatures';
import { ME_REMINDERS_HREF, ME_SCHEDULED_HREF } from '../../utils/chat-ext-routes';

/**
 * Hai hàng lối vào ở màn Tôi (app.md p7-04 §1): "Tin đã hẹn" (cờ `scheduledMessages`) và "Nhắc lại của tôi" (cờ `messageReminders`). Đăng ký vào khe `@/shared/profile` ở `register-profile.tsx`, nên
 * `features/me` không import feature này. Cờ tắt hoặc chưa biết ⇒ hàng ẩn (DU-05) — không cần "nháy" hiện tạm.
 */
export function ScheduledMeRow() {
  const { scheduledMessages } = useChatSubFeatures();
  if (!scheduledMessages) return null;
  return (
    <ListItem
      className="py-xs"
      description="Xem, sửa, huỷ hoặc gửi ngay các tin bạn đã hẹn giờ"
      divider
      label="Tin đã hẹn"
      leading={<IconTile name="timer" tone="accent" />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      onPress={() => router.push(ME_SCHEDULED_HREF)}
    />
  );
}

export function RemindersMeRow() {
  const { messageReminders } = useChatSubFeatures();
  if (!messageReminders) return null;
  return (
    <ListItem
      className="py-xs"
      description="Các tin bạn đã đặt nhắc lại"
      divider
      label="Nhắc lại của tôi"
      leading={<IconTile name="noti" tone="warning" />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      onPress={() => router.push(ME_REMINDERS_HREF)}
    />
  );
}
