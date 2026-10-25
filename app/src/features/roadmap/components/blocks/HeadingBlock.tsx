import { Text, View, type LayoutChangeEvent } from 'react-native';

import type { Block } from '../../api/roadmap.types';
import { Spans } from './Spans';

const HEADING_CLASS: Record<2 | 3 | 4, string> = {
  2: 'text-header-sm font-semibold text-fg-1',
  3: 'text-body-lg font-semibold text-fg-1',
  4: 'text-body-md font-semibold text-fg-1',
};

export interface HeadingBlockProps {
  block: Extract<Block, { type: 'heading' }>;
  /** Báo vị trí Y (tương đối với gốc `BlockList` chứa nó) cho `ContentTab` cộng dồn — dùng khi cuộn tới từ `TocSheet`. */
  onAnchorLayout?: (anchor: string, y: number) => void;
}

/** Tiêu đề mục H2–H4 (H1 đã là `title` của buổi, be.md §5.1). */
export function HeadingBlock({ block, onAnchorLayout }: HeadingBlockProps) {
  const handleLayout = (event: LayoutChangeEvent) => {
    onAnchorLayout?.(block.anchor, event.nativeEvent.layout.y);
  };

  return (
    <View onLayout={onAnchorLayout ? handleLayout : undefined}>
      <Text className={HEADING_CLASS[block.level]}>
        <Spans spans={block.spans} />
      </Text>
    </View>
  );
}
