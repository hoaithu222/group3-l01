import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { hapticTap } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import { QUICK_REACTIONS } from '../../chat.constants';

export interface QuickReactionBarProps {
  /** Emoji CHÍNH MÌNH đã thả trên tin này (nếu có) — bấm lại để bỏ. */
  myReaction?: string;
  onSelect: (emoji: string) => void;
  /** Có thì thêm nút "+" mở `EmojiPickerSheet` — cảm xúc ngoài bộ nhanh. */
  onMore?: () => void;
}

/** Thanh cảm xúc nhanh trong `MessageActionSheet` — `SystemConfig chat.quickReactions` (app.md §3). */
export function QuickReactionBar({ myReaction, onSelect, onMore }: QuickReactionBarProps) {
  return (
    /* Không tự khai `px-*`: lề 16 do `SheetList` của `MessageActionSheet` cấp — khai thêm là thanh cảm xúc thụt 32dp so với tiêu đề. */
    <View className="flex-row justify-between py-xs">
      {QUICK_REACTIONS.map((emoji) => (
        <Pressable
          key={emoji}
          accessibilityLabel={`Thả cảm xúc ${emoji}`}
          accessibilityRole="button"
          accessibilityState={{ selected: myReaction === emoji }}
          className={cn(
            'h-11 w-11 items-center justify-center rounded-full active:opacity-70',
            myReaction === emoji && 'bg-action-tint',
          )}
          hitSlop={4}
          // Rung nhẹ xác nhận THẢ cảm xúc (hành động chính của thanh này) — tấm đóng ngay sau đó nên rung là phản hồi duy nhất.
          onPress={() => {
            hapticTap();
            onSelect(emoji);
          }}
        >
          {/* Ô cao CỨNG 44dp (`h-11`): emoji 24px phóng 2× (cỡ chữ hệ thống) cao ~64dp và bị cắt — chặn TRẦN 1.3× (đúng mẫu `Badge`/`Chip`). */}
          <Text className="text-header-sm" maxFontSizeMultiplier={1.3}>
            {emoji}
          </Text>
        </Pressable>
      ))}
      {onMore ? (
        <Pressable
          accessibilityLabel="Chọn cảm xúc khác"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-full bg-bg-2 active:opacity-70"
          hitSlop={4}
          onPress={onMore}
        >
          <Icon color="fg-2" name="add" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}
