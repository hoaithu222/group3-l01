import { Text } from 'react-native';

import type { Block } from '../../api/roadmap.types';
import { Spans } from './Spans';

export interface ParagraphBlockProps {
  block: Extract<Block, { type: 'paragraph' }>;
}

/** Đoạn văn (be.md §5.1 `type: 'paragraph'`). */
export function ParagraphBlock({ block }: ParagraphBlockProps) {
  return (
    <Text className="text-body-md text-fg-1">
      <Spans spans={block.spans} />
    </Text>
  );
}
