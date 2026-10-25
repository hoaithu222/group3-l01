import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { MessageView, ResolveChatAuthor } from '../../api/chat.types';
import { previewText } from '../../utils/preview-text';

export interface ReplyStripProps {
  message: MessageView;
  resolveAuthor?: ResolveChatAuthor;
  onCancel: () => void;
}

/**
 * Trên ô nhập — nội dung đang trả lời + nút huỷ (app.md §3).
 *
 * Là THẺ nhỏ (`bg-bg-3` bo `rounded-xs`, lề ngang 16, cách hàng nhập 8) chứ không phải dải full-bleed có `border-t` như bản cũ: dải cũ
 * đứng ngay dưới `border-t` của khung soạn tin ⇒ hai vạch kẻ liền nhau, và chữ/nút đóng dính sát mép màn hình.
 */
export function ReplyStrip({ message, resolveAuthor, onCancel }: ReplyStripProps) {
  const authorName = (message.authorId && resolveAuthor?.(message.authorId)?.name) || 'Thành viên';

  return (
    <View className="mx-md mt-xs flex-row items-center gap-xs rounded-xs bg-bg-3 px-sm py-xs">
      <Icon color="fg-brand" name="arrow-left" size={16} />
      <View className="flex-1">
        <Text className="text-label-xs font-semibold text-fg-brand" numberOfLines={1}>
          Trả lời {authorName}
        </Text>
        <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
          {previewText(message)}
        </Text>
      </View>
      {/* Icon 18dp + `hitSlop` 14 mỗi phía = 46dp — đủ ngưỡng chạm 44dp (`hitSlop={8}` cũ chỉ ra 34dp). */}
      <Pressable accessibilityLabel="Huỷ trả lời" accessibilityRole="button" hitSlop={14} onPress={onCancel}>
        <Icon color="fg-2" name="cancel" size={18} />
      </Pressable>
    </View>
  );
}
