import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { Span } from '../../api/roadmap.types';
import { Spans } from './Spans';

export interface DetailsBlockProps {
  /** Nội dung ĐÃ DỰNG (`BlockList` tự đệ quy dựng `block.blocks` rồi truyền vào — cùng lý do ở `QuoteBlock.tsx`). */
  children: ReactNode;
  summary: readonly Span[];
}

/**
 * Khối thu gọn `<details><summary>` (be.md §5.1 `type: 'details'`) — **đóng mặc định** (app.md §7.4: đáp án/gợi ý
 * bài tập không lộ ngay).
 */
export function DetailsBlock({ children, summary }: DetailsBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <View className="gap-xs rounded-2xs border border-border-1 p-sm">
      {/* Hàng tiêu đề chỉ cao một dòng chữ (~20dp) ⇒ `hitSlop` 12 mỗi phía (đúng bằng đệm `p-sm` của khung) nới vùng chạm lên
          ≥ 44dp mà không làm khối cao thêm; `active:opacity-70` báo cú chạm đã ăn trước khi khối mở ra. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-xs active:opacity-70"
        hitSlop={12}
        onPress={() => setOpen((current) => !current)}
      >
        <Text className="flex-1 text-body-md font-semibold text-fg-1">
          <Spans spans={summary} />
        </Text>
        <Icon color="fg-2" name={open ? 'arrow-up-small' : 'arrow-down-small'} size="sm" />
      </Pressable>
      {open ? <View className="gap-md">{children}</View> : null}
    </View>
  );
}
