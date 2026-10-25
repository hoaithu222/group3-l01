import { View } from 'react-native';

import { Divider } from '@/shared/ui';

import type { Block } from '../../api/roadmap.types';
import { ChecklistBlock } from './ChecklistBlock';
import { CodeBlock } from './CodeBlock';
import { DetailsBlock } from './DetailsBlock';
import { HeadingBlock } from './HeadingBlock';
import { ImageBlock } from './ImageBlock';
import { ListBlock } from './ListBlock';
import { ParagraphBlock } from './ParagraphBlock';
import { QuoteBlock } from './QuoteBlock';
import { TableBlock } from './TableBlock';

export interface BlockListProps {
  blocks: readonly Block[];
  /** Vị trí Y của heading — CHỈ có tác dụng ở cấp NGOÀI CÙNG (xem `utils/block-anchors.ts`); lời gọi đệ quy bên
   *  dưới cố ý KHÔNG truyền tiếp prop này. */
  onAnchorLayout?: (anchor: string, y: number) => void;
}

/**
 * Bộ render đệ quy cho `Block[]` (be.md §5.1) — map từng khối sang đúng component con theo `type`. Media của buổi
 * (ảnh trong bài) đi qua `BlockMediaContext` (`block-context.ts`), không chuyền tay qua từng tầng đệ quy.
 *
 * ⚠️ Đệ quy nằm NGUYÊN TRONG file này (`BlockItem` tự gọi lại `BlockList` cho `quote.blocks` / `details.blocks` /
 * từng mục của `list.items`) — `QuoteBlock`/`DetailsBlock`/`ListBlock` chỉ nhận `children`/`items` ĐÃ DỰNG SẴN qua
 * props, không tự `import { BlockList }`. Làm ngược lại (ba component con tự import `BlockList`, `BlockList` tự
 * import cả ba) tạo một VÒNG import giữa các file — `import/no-cycle` (ESLint, `maxDepth: Infinity`, không có
 * ngoại lệ cho đệ quy cùng thư mục) chặn đỏ ngay.
 */
export function BlockList({ blocks, onAnchorLayout }: BlockListProps) {
  return (
    <View className="gap-md">
      {blocks.map((block, index) => (
        <BlockItem key={index} block={block} onAnchorLayout={onAnchorLayout} />
      ))}
    </View>
  );
}

function BlockItem({ block, onAnchorLayout }: { block: Block; onAnchorLayout?: (anchor: string, y: number) => void }) {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock block={block} onAnchorLayout={onAnchorLayout} />;
    case 'paragraph':
      return <ParagraphBlock block={block} />;
    case 'list':
      return (
        <ListBlock
          items={block.items.map((itemBlocks, itemIndex) => (
            <BlockList key={itemIndex} blocks={itemBlocks} />
          ))}
          ordered={block.ordered}
          start={block.start}
        />
      );
    case 'checklist':
      return <ChecklistBlock block={block} />;
    case 'code':
      return <CodeBlock block={block} />;
    case 'table':
      return <TableBlock block={block} />;
    case 'quote':
      return (
        <QuoteBlock>
          <BlockList blocks={block.blocks} />
        </QuoteBlock>
      );
    case 'details':
      return (
        <DetailsBlock summary={block.summary}>
          <BlockList blocks={block.blocks} />
        </DetailsBlock>
      );
    case 'image':
      return <ImageBlock block={block} />;
    case 'divider':
      return <Divider />;
    default:
      return null;
  }
}
