import { Pressable, Text, View } from 'react-native';

import { hapticTap } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { MessageReactionView } from '../../api/chat.types';

export interface ReactionsRowProps {
  className?: string;
  reactions: MessageReactionView[];
  /** Bấm chip → toggle (thêm/bỏ chính mình). */
  onToggle: (emoji: string) => void;
  /** Giữ chip → `WhoReactedSheet` (cursor người đã thả). */
  onLongPress?: (emoji: string) => void;
}

/** Chip emoji + số, viền đậm khi `me` (app.md §3). */
export function ReactionsRow({ className, reactions, onToggle, onLongPress }: ReactionsRowProps) {
  if (reactions.length === 0) return null;

  return (
    <View className={cn('flex-row flex-wrap gap-2xs', className)}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          accessibilityLabel={`${r.emoji} ${r.count}${r.me ? ', bạn đã thả' : ''}`}
          accessibilityRole="button"
          accessibilityState={{ selected: r.me }}
          className={cn(
            'min-h-8 flex-row items-center gap-3xs rounded-full border px-2xs py-3xs active:opacity-70',
            r.me ? 'border-border-brand bg-action-tint' : 'border-border-1 bg-bg-1',
          )}
          hitSlop={6}
          onLongPress={onLongPress ? () => onLongPress(r.emoji) : undefined}
          // Rung nhẹ xác nhận thả/bỏ cảm xúc — lời gọi hàm thuần, không thêm hook/state cho mỗi bong bóng của danh sách ảo.
          onPress={() => {
            hapticTap();
            onToggle(r.emoji);
          }}
        >
          <Text>{r.emoji}</Text>
          <Text className={cn('text-label-xs', r.me ? 'text-fg-brand' : 'text-fg-2')}>{r.count}</Text>
        </Pressable>
      ))}
    </View>
  );
}
