import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

export interface ListBlockProps {
  /** Nội dung ĐÃ DỰNG của từng mục (`BlockList` tự đệ quy dựng rồi truyền vào — xem chú thích ở `BlockList.tsx`). */
  items: readonly ReactNode[];
  ordered: boolean;
  start?: number;
}

/**
 * Danh sách gạch đầu dòng/đánh số (be.md §5.1 `type: 'list'`).
 *
 * ⛔ Component này KHÔNG biết gì về `Block[]` hay tự đệ quy — cố ý "câm": nếu nó tự `import { BlockList }` để dựng
 * `items: Block[][]` thì `BlockList.tsx` (nơi dựng `<ListBlock>`) và file này import lẫn nhau, bị
 * `import/no-cycle` (ESLint, `maxDepth: Infinity`) chặn đỏ. `BlockList` dựng SẴN nội dung từng mục rồi mới truyền
 * vào đây qua `items` — cùng kỹ thuật "render prop qua children đã dựng" mà `QuoteBlock`/`DetailsBlock` dùng.
 */
export function ListBlock({ items, ordered, start = 1 }: ListBlockProps) {
  return (
    <View accessibilityRole="list" className="gap-2xs">
      {items.map((content, index) => (
        <View key={index} className="flex-row gap-xs">
          <Text className="text-body-md text-fg-2">{ordered ? `${String(start + index)}.` : '•'}</Text>
          <View className="flex-1">{content}</View>
        </View>
      ))}
    </View>
  );
}
