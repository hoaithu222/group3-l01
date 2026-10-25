import { type ReactNode } from 'react';
import { View } from 'react-native';

export interface QuoteBlockProps {
  /** Nội dung ĐÃ DỰNG (`BlockList` tự đệ quy dựng `block.blocks` rồi truyền vào — xem `BlockList.tsx`, `ListBlock.tsx`). */
  children: ReactNode;
}

/** Trích dẫn (be.md §5.1 `type: 'quote'`) — vạch trái, cùng dáng `MarkdownView`'s quote của `boards`. */
export function QuoteBlock({ children }: QuoteBlockProps) {
  return <View className="gap-xs border-l-2 border-border-strong pl-sm">{children}</View>;
}
