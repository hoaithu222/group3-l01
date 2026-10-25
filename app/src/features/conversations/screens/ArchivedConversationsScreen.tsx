import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { ConversationListItem } from '../api/conversations.types';
import { ConversationCard } from '../components/ConversationCard';
import { ConversationListSkeleton } from '../components/ConversationListSkeleton';
import { useConversationList } from '../hooks/useConversationList';

function openConversation(id: string): void {
  router.push({ pathname: '/messages/[conversationId]', params: { conversationId: id } });
}

/** app.md §3 — danh sách `filter=archived` dạng THẺ như màn chính (`ConversationCard`), swipe "Bỏ lưu trữ" tự đảo nhãn theo `archivedAt`. */
export function ArchivedConversationsScreen() {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const list = useConversationList('archived');
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void list.refetch(),
    refreshing: list.isRefetching,
  });

  return (
    <Screen
      header={<AppBar title="Đã lưu trữ" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 py-xs">
        {list.isLoading ? (
          <ConversationListSkeleton rows={6} />
        ) : list.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void list.refetch() }]}
            description={toErrorMessage(list.error)}
            icon="alert-warning"
            title="Không tải được"
            tone="danger"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="Cuộc trò chuyện đã lưu trữ sẽ hiện ở đây."
            icon="history"
            title="Không có cuộc trò chuyện lưu trữ"
          />
        ) : (
          <FlashList<ConversationListItem>
            contentContainerStyle={{ paddingBottom: 16 }}
            data={items}
            keyExtractor={(item) => item.id}
            refreshControl={refreshControl}
            renderItem={({ item }) => (
              <ConversationCard
                currentUserId={currentUserId}
                item={item}
                onPress={(i) => openConversation(i.id)}
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
    </Screen>
  );
}
