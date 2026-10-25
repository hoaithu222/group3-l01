import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

export interface TombstoneProps {
  /** `onAction` = bong bóng CỦA MÌNH (nền `action-base`) ⇒ chữ + icon `action-fg`; chữ xám trên nền thương hiệu đậm không đọc được. */
  tone?: 'default' | 'onAction';
}

/**
 * "Tin nhắn đã được thu hồi" (app.md §3). BE `MessageView` (REST) KHÔNG lộ
 * `deleteMode` (chỉ `Message` entity nội bộ có — `entities/message.interface.ts`),
 * nên KHÔNG phân biệt được "tác giả tự thu hồi" / "kiểm duyệt gỡ" cho tin tải
 * qua REST — chỉ sự kiện `message:deleted` LIVE mới mang `mode`, và p1-08
 * (kiểm duyệt) chưa xây ở phiên này nên nhánh MODERATION thực tế chưa xảy ra.
 * Dùng MỘT câu chung, khớp `MSG_006`.
 */
export function Tombstone({ tone = 'default' }: TombstoneProps) {
  const onAction = tone === 'onAction';
  return (
    <View className="flex-row items-center gap-2xs px-sm py-2xs">
      {/* `fg-2` chứ không `fg-3`: hình phi văn bản cần ≥ 3:1 trên nền bong bóng — `fg-3` tối đa 2.96:1. */}
      <Icon color={onAction ? 'action-fg' : 'fg-2'} name="delete" size={14} />
      <Text
        className={
          onAction ? 'text-caption-sm italic text-action-fg' : 'text-caption-sm italic text-fg-2'
        }
      >
        Tin nhắn đã được thu hồi
      </Text>
    </View>
  );
}
