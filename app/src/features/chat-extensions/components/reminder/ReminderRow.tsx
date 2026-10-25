import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { ActionMenu } from '@/shared/ui/action-menu';
import { IconTile } from '@/shared/ui/icon-tile';

import type { ReminderView } from '../../api/chat-extensions.types';
import { formatWhen } from '../../utils/local-time';

export interface ReminderRowProps {
  reminder: ReminderView;
  onOpen: (reminder: ReminderView) => void;
  onDelete: (reminder: ReminderView) => void;
}

/**
 * Một lời nhắc: trích tin (CHỈ khi còn đọc được lúc xem — BE kiểm quyền lại từng tin), giờ nhắc theo giờ máy, và menu "Xoá" cho lời nhắc đang chờ. Tin đã gỡ/mất quyền (`unavailable`)
 * hiện "Tin không còn khả dụng" và TUYỆT ĐỐI không trích nội dung (REMIND-01: BE cũng không gửi `messageId`/nội dung trong thông báo đó). Chạm dòng ⇒ mở tin (dòng `unavailable` chỉ báo toast).
 * Ngoại tuyến ⇒ ẩn menu ghi (chỉ xem cache).
 */
export const ReminderRow = memo(function ReminderRow({ reminder, onOpen, onDelete }: ReminderRowProps) {
  const offline = useConnectionState() === 'offline';
  const pending = reminder.status === 'PENDING';
  const title = reminder.unavailable ? 'Tin không còn khả dụng' : (reminder.preview ?? 'Tin nhắn');
  const when = `${pending ? 'Nhắc lúc' : 'Đã nhắc lúc'} ${formatWhen(reminder.remindAt)}`;

  return (
    <View className="flex-row items-center border-b border-divider-1 pl-md">
      <Pressable
        accessibilityHint={reminder.unavailable ? undefined : 'Mở tin nhắn'}
        accessibilityLabel={`${title}. ${when}`}
        accessibilityRole="button"
        className="min-h-14 flex-1 flex-row items-center gap-sm py-sm active:opacity-70"
        onPress={() => onOpen(reminder)}
      >
        {/* Ô icon có tông theo trạng thái: sắp nhắc = chuông `warning` (cần để mắt), đã nhắc = tick `success`, tin không còn = `neutral`. */}
        <IconTile
          name={pending ? 'noti' : 'checkmark-circle'}
          tone={reminder.unavailable ? 'neutral' : pending ? 'warning' : 'success'}
        />
        <View className="flex-1 gap-3xs">
          <Text className={reminder.unavailable ? 'text-body-md text-fg-2' : 'text-body-md text-fg-1'} numberOfLines={2}>
            {title}
          </Text>
          <Text className="text-caption-sm text-fg-2">{when}</Text>
        </View>
      </Pressable>
      <View className="pr-xs">
        <ActionMenu
          accessibilityLabel="Tuỳ chọn cho lời nhắc"
          items={[
            {
              key: 'delete',
              icon: 'delete',
              label: 'Xoá lời nhắc',
              tone: 'danger',
              hidden: !pending || offline,
              onPress: () => onDelete(reminder),
            },
          ]}
        />
      </View>
    </View>
  );
});
