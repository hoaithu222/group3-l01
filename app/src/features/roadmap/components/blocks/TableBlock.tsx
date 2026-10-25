import { ScrollView, Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import type { Block, Span } from '../../api/roadmap.types';
import { Spans } from './Spans';

export interface TableBlockProps {
  block: Extract<Block, { type: 'table' }>;
}

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  center: 'text-center',
  left: 'text-left',
  right: 'text-right',
};

/** Cột tối thiểu 120dp (app.md §7.2) — số đo layout thô như `CodeLines.tsx`, không phải màu/cỡ chữ nên không qua token. */
const MIN_COLUMN_WIDTH = 120;

function Cell({
  align,
  header = false,
  spans,
}: {
  align: 'left' | 'center' | 'right';
  header?: boolean;
  spans: readonly Span[];
}) {
  return (
    <View
      className={cn('justify-center border-b border-border-1 px-sm py-xs', header && 'bg-bg-2')}
      style={{ minWidth: MIN_COLUMN_WIDTH }}
    >
      <Text className={cn('text-body-md text-fg-1', header && 'font-semibold', ALIGN_CLASS[align])}>
        <Spans spans={spans} />
      </Text>
    </View>
  );
}

/**
 * Bảng cuộn NGANG (app.md §7.2). "Hàng đầu dính" của đặc tả đọc thành TÔ NỀN phân biệt ở đây thay vì dính thật lúc
 * cuộn dọc: bảng nằm lồng sâu trong `ScrollView` của cả buổi (`ContentTab`), không ghép được `stickyHeaderIndices`
 * của RN vào một `ScrollView` NGANG khác cấp — ưu tiên phần quan trọng hơn (đọc đúng cột) trước.
 */
export function TableBlock({ block }: TableBlockProps) {
  return (
    <ScrollView
      className="rounded-2xs border border-border-1"
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <View className="flex-row">
          {block.header.map((spans, index) => (
            <Cell key={index} align={block.align[index] ?? 'left'} header spans={spans} />
          ))}
        </View>
        {block.rows.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row">
            {row.map((spans, cellIndex) => (
              <Cell key={cellIndex} align={block.align[cellIndex] ?? 'left'} spans={spans} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
