import { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  FlashList,
  type FlashListRef,
  type ListRenderItemInfo,
  type ViewToken,
} from '@shopify/flash-list';

import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { LoadingMore } from '@/shared/ui/progress';

import type { ResolveChatAuthor } from '../../api/chat.types';
import type { BubbleHandlers } from '../bubble/bubble-handlers.types';
import { MessageBubble } from '../bubble/MessageBubble';
import { SystemLine } from '../system/SystemLine';
import type { ChatRow } from './buildRows';
import { DateSeparator } from './DateSeparator';
import { maxVisibleSeq } from './max-visible-seq';
import { UnreadDivider } from './UnreadDivider';

export interface MessageListProps extends BubbleHandlers {
  rows: ChatRow[];
  currentUserId: string | undefined;
  resolveAuthor?: ResolveChatAuthor;
  highlightMessageId?: string;
  listRef: React.RefObject<FlashListRef<ChatRow> | null>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  hasMoreBefore: boolean;
  isFetchingBefore: boolean;
  isFetchBeforeError: boolean;
  onLoadBefore: () => void;
  hasMoreAfter: boolean;
  isFetchingAfter: boolean;
  onLoadAfter: () => void;
  /**
   * seq LỚN NHẤT trong các tin đang HIỂN THỊ (đủ 60% chiều cao, ≥ 250 ms) — nguồn duy nhất của "đã đọc" (p1-07 §4.2:
   * nhận socket ≠ đã đọc). Không truyền thì danh sách không báo gì (ví dụ ngoài luồng chat có mốc đọc).
   */
  onVisibleMaxSeq?: (seq: number) => void;
}

/** Tin coi là "đã hiển thị" khi thấy ≥ 60% và giữ ≥ 250 ms — vuốt lướt qua không tính là đã đọc. */
const READ_VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 250 } as const;

function EdgeRow({
  hasMore,
  fetching,
  failed,
  label,
  onRetry,
}: {
  hasMore: boolean;
  fetching: boolean;
  failed: boolean;
  label: string;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <View className="items-center px-md py-sm">
        <Button label={label} size="sm" variant="tertiary" onPress={onRetry} />
      </View>
    );
  }
  if (fetching) return <LoadingMore />;
  if (!hasMore) return null;
  return <View className="h-sm" />;
}

/**
 * `FlashList` KHÔNG `inverted` (2.x đã bỏ prop này) — dữ liệu render ĐÚNG thứ tự thời gian (cũ → mới),
 * `maintainVisibleContentPosition.startRenderingFromBottom` tự canh khung nhìn ở cuối lúc mở màn kiểu chat. `onStartReached` (đầu = cũ hơn)
 * tải `beforeSeq`; `onEndReached` (cuối = mới hơn) tải `afterSeq` — chỉ có ý nghĩa khi đang ở chế độ `around` chưa bắt kịp tin mới nhất.
 */
export function MessageList({
  rows,
  currentUserId,
  resolveAuthor,
  highlightMessageId,
  listRef,
  onScroll,
  hasMoreBefore,
  isFetchingBefore,
  isFetchBeforeError,
  onLoadBefore,
  hasMoreAfter,
  isFetchingAfter,
  onLoadAfter,
  onVisibleMaxSeq,
  ...handlers
}: MessageListProps) {
  // Callback ổn định, đọc handler MỚI NHẤT qua ref — FlashList giữ callback viewability từ lúc mount.
  const visibleRef = useRef(onVisibleMaxSeq);
  useEffect(() => {
    visibleRef.current = onVisibleMaxSeq;
  });
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatRow>[] }) => {
      const max = maxVisibleSeq(viewableItems);
      if (max > 0) visibleRef.current?.(max);
    },
    [],
  );

  const renderItem = ({ item }: ListRenderItemInfo<ChatRow>) => {
    if (item.type === 'date') return <DateSeparator dateKey={item.label} />;
    if (item.type === 'unread') return <UnreadDivider />;
    if (item.item.kind === 'sent' && item.item.message.kind === 'SYSTEM') {
      return (
        <SystemLine
          message={item.item.message}
          resolveAuthor={resolveAuthor}
          onViewPinned={handlers.onPressReplyQuote}
        />
      );
    }
    const isOwn = item.item.kind === 'pending' || item.item.message.authorId === currentUserId;
    const id = item.item.kind === 'pending' ? undefined : item.item.message.id;
    return (
      <MessageBubble
        grouped={item.grouped}
        highlighted={id !== undefined && id === highlightMessageId}
        isOwn={isOwn}
        item={item.item}
        resolveAuthor={resolveAuthor}
        {...handlers}
      />
    );
  };

  return (
    <FlashList<ChatRow>
      ref={listRef}
      data={rows}
      keyExtractor={(row) => row.key}
      ListFooterComponent={
        <EdgeRow
          failed={false}
          fetching={isFetchingAfter}
          hasMore={hasMoreAfter}
          label=""
          onRetry={onLoadAfter}
        />
      }
      ListHeaderComponent={
        <EdgeRow
          failed={isFetchBeforeError}
          fetching={isFetchingBefore}
          hasMore={hasMoreBefore}
          label="Không tải được tin cũ · Thử lại"
          onRetry={onLoadBefore}
        />
      }
      maintainVisibleContentPosition={{
        startRenderingFromBottom: true,
        autoscrollToBottomThreshold: 0.2,
      }}
      renderItem={renderItem}
      scrollEventThrottle={100}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      viewabilityConfig={READ_VIEWABILITY}
      onEndReached={() => {
        if (hasMoreAfter && !isFetchingAfter) onLoadAfter();
      }}
      onEndReachedThreshold={0.4}
      onScroll={onScroll}
      onStartReached={() => {
        if (hasMoreBefore && !isFetchingBefore) onLoadBefore();
      }}
      onStartReachedThreshold={0.4}
      onViewableItemsChanged={onViewableItemsChanged}
    />
  );
}

export function MessageListSkeleton() {
  return (
    // `flex-1`: thiếu thì khối này chỉ cao bằng 6 dòng skeleton, đẩy `Composer` lên lưng chừng màn lúc đang tải.
    <View className="flex-1 gap-sm px-md py-sm">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className={i % 2 === 0 ? 'ml-auto h-10 w-2/3 rounded-xs' : 'h-10 w-2/3 rounded-xs'}
        />
      ))}
    </View>
  );
}

export function MessageListText({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center px-md">
      <Text className="text-body-md text-fg-2">{text}</Text>
    </View>
  );
}
