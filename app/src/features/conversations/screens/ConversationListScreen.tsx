import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { CallHistoryEntrySlot } from '@/shared/calls';
import { useNow } from '@/shared/hooks/useNow';
import { useBreakpoint } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { ConversationFilter, ConversationListItem } from '../api/conversations.types';
import { ArchivedConversationsEntry } from '../components/ArchivedConversationsEntry';
import { ConversationCard } from '../components/ConversationCard';
import { ConversationFilterChips } from '../components/ConversationFilterChips';
import { ConversationListSkeleton } from '../components/ConversationListSkeleton';
import { PinnedConversationsSection } from '../components/PinnedConversationsSection';
import { ReadAllConversationsButton } from '../components/ReadAllConversationsButton';
import { useConversationList, usePinnedConversations } from '../hooks/useConversationList';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useActiveConversationStore } from '../store/active-conversation.store';

/**
 * Hai cột (tablet): chọn hội thoại khác chỉ THAY khung phải (`replace`) chứ không
 * xếp chồng ngăn xếp — nút back của khung phải bị ẩn ở tablet (`ConversationHeader`)
 * nên chồng ngăn xếp sẽ không có đường nào gỡ ra. Điện thoại vẫn `push` như cũ.
 */
function openConversation(id: string, replace: boolean): void {
  const target = {
    pathname: '/messages/[conversationId]',
    params: { conversationId: id },
  } as const;
  if (replace) router.replace(target);
  else router.push(target);
}

/**
 * app.md §3 — AppBar "Tin nhắn" + ✎ + tìm + chip lọc + "Đã ghim" + danh sách THẺ (`ConversationCard`) + "Đã lưu trữ".
 * Máy tính bảng: thẻ của hội thoại đang mở ở khung phải được đánh dấu (`active`).
 */
export function ConversationListScreen() {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { isTablet } = useBreakpoint();
  const activeId = useActiveConversationStore((state) => state.id);
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [query, setQuery] = useState('');
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const debouncedQuery = useDebouncedValue(query).trim();

  const list = useConversationList(filter, debouncedQuery || undefined);
  const pinned = usePinnedConversations();
  // Cột giờ của hàng ("Vừa xong", "5 phút"…) tự nhảy mỗi phút — đọc từ STATE, lý do ở `formatRelativeShort`.
  const now = useNow();

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  const pinnedItems = pinned.data ?? [];
  const hasPinned = pinnedItems.length > 0;
  // Còn hội thoại ĐÃ GHIM thì danh sách không "rỗng": chỉ hiện EmptyState khi cả hai cùng trống.
  const isEmpty = !list.isLoading && !list.isError && items.length === 0 && !hasPinned;
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void list.refetch(),
    refreshing: list.isRefetching,
  });

  // "Đã ghim" (≤ 20 hàng) + dòng "đánh dấu đã đọc hết" nằm TRONG vùng cuộn của danh sách: bản cũ để chúng ngoài `FlashList`
  // nên 20 hàng ghim chiếm trọn màn và danh sách bên dưới không còn chỗ cuộn.
  const listHeader = (
    <View className="gap-2xs">
      <ReadAllConversationsButton />
      {hasPinned ? (
        <PinnedConversationsSection
          activeId={activeId}
          currentUserId={currentUserId}
          expanded={pinnedExpanded}
          items={pinnedItems}
          now={now}
          onOpen={(item) => openConversation(item.id, isTablet)}
          onToggle={() => setPinnedExpanded((v) => !v)}
        />
      ) : null}
    </View>
  );

  return (
    <Screen
      header={
        <AppBar
          actions={
            <View className="flex-row items-center gap-2xs">
              {/* p2-01: lối vào lịch sử cuộc gọi (slot `@/shared/calls`, ẩn khi cờ voice tắt) */}
              <CallHistoryEntrySlot />
              <Button
                accessibilityLabel="Nhắn tin mới"
                iconLeft="edit"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => router.push('/messages/new')}
              />
            </View>
          }
          title="Tin nhắn"
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 pt-xs">
        {/* `pb-1.5` + `py-1.5` của dải chip = khe 12 giữa ô tìm và chip. Dải chip đứng NGOÀI khối `px-md` — nó tràn
            viền và tự có lề 16 bên trong (lý do ở `ConversationFilterChips`). */}
        <View className="px-md pb-1.5">
          <SearchInput placeholder="Tìm hội thoại" onChangeText={setQuery} />
        </View>
        <ConversationFilterChips value={filter} onChange={setFilter} />

        <View className="flex-1 pt-2xs">
          {list.isLoading ? (
            <ConversationListSkeleton />
          ) : list.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void list.refetch() }]}
              description={toErrorMessage(list.error)}
              icon="alert-warning"
              title="Không tải được danh sách"
              tone="danger"
            />
          ) : isEmpty ? (
            <EmptyState
              actions={
                debouncedQuery
                  ? undefined
                  : [{ label: 'Nhắn tin mới', onPress: () => router.push('/messages/new') }]
              }
              description={debouncedQuery ? 'Không tìm thấy cuộc trò chuyện nào khớp.' : undefined}
              // Chưa có cuộc trò chuyện ⇒ bong bóng chat (mời bắt đầu); đang tìm mà rỗng ⇒ kính lúp.
              icon={debouncedQuery ? 'search' : 'chat-bubble'}
              title={debouncedQuery ? 'Không có kết quả' : 'Chưa có cuộc trò chuyện'}
              tone={debouncedQuery ? 'neutral' : 'brand'}
            />
          ) : (
            <FlashList<ConversationListItem>
              contentContainerStyle={{ paddingBottom: 16 }}
              data={items}
              // Vẽ lại hàng đang hiện mỗi khi `now` nhảy phút — thiếu nó FlashList giữ nguyên ô cũ và cột giờ đứng im.
              extraData={now}
              keyExtractor={(item) => item.id}
              ListFooterComponent={<ArchivedConversationsEntry />}
              ListHeaderComponent={listHeader}
              refreshControl={refreshControl}
              renderItem={({ item }) => (
                <ConversationCard
                  active={item.id === activeId}
                  currentUserId={currentUserId}
                  item={item}
                  now={now}
                  onPress={(i) => openConversation(i.id, isTablet)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              onEndReached={() => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }}
              onEndReachedThreshold={0.4}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}
