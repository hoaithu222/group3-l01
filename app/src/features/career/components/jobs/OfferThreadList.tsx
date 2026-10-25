import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { InvertedVirtualList } from '@/shared/ui/virtual-list';

import type { ThreadRow } from '../../utils/offer-thread.types';
import { OfferMessageBubble } from './OfferMessageBubble';

export interface OfferThreadListProps {
  companyName: string;
  hasOlder: boolean;
  isFetchingOlder: boolean;
  rows: ThreadRow[];
  onLoadOlder: () => void;
  onRetry: (id: string) => void;
}

/**
 * Danh sách tin trong thread (app.md §2 `OfferThreadList`): kiểu chat — mở ở ĐÁY, kéo lên tải tin cũ mà không nhảy vị trí (`InvertedVirtualList`, FlashList 2 —
 * không có `inverted`). `rows` đã theo thứ tự cũ → mới (tin đang gửi ở cuối). Rỗng ⇒ lời mời trao đổi mở đầu ("Hãy bắt đầu bằng lời chào").
 */
export function OfferThreadList({
  companyName,
  hasOlder,
  isFetchingOlder,
  onLoadOlder,
  onRetry,
  rows,
}: OfferThreadListProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        description="Nhắn một lời chào để bắt đầu trao đổi với doanh nghiệp."
        fullscreen
        icon="chat-bubble"
        title="Hãy bắt đầu bằng lời chào"
        tone="accent"
      />
    );
  }

  return (
    <InvertedVirtualList
      data={rows}
      hasOlder={hasOlder}
      header={isFetchingOlder ? <LoadingMore /> : undefined}
      isFetchingOlder={isFetchingOlder}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => (
        <OfferMessageBubble companyName={companyName} row={item} onRetry={onRetry} />
      )}
      onLoadOlder={onLoadOlder}
    />
  );
}
