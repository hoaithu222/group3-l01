import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { LoadingMore } from '@/shared/ui/progress';
import { hapticTap } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { DiscoveryScope, PinnedItem } from '../api/discovery.types';
import { PinnedItemRow } from '../components/PinnedItemRow';
import { useScopeDiscoverySocket } from '../hooks/useScopeDiscoverySocket';
import { usePins, useUnpin } from '../queries/pins.queries';
import { useScopeMembers } from '../queries/search.queries';
import { describeDiscoveryError } from '../utils/error-info';
import { openMessage } from '../utils/open-message';

export interface PinnedListScreenProps {
  scope: DiscoveryScope;
}

/**
 * Tin đã ghim của MỘT kênh (≤ 20) hoặc hội thoại (≤ 10) — app.md p1-09 §3. Ghim/bỏ ghim vẫn là thao tác của p1-04 (menu
 * tin ở màn chat); màn này chỉ ĐỌC danh sách, mở tin `around`, và cho gỡ ghim khi `myPermissions.canPin`. Realtime:
 * `pin:updated` làm mới danh sách (`useScopeDiscoverySocket`); mất quyền (404) → toast trung tính rồi rời màn.
 */
export function PinnedListScreen({ scope }: PinnedListScreenProps) {
  const pins = usePins(scope);
  const members = useScopeMembers(scope, '');
  const { isPending: isUnpinning, mutate: unpinMessage, variables: unpinningId } = useUnpin(scope);
  useScopeDiscoverySocket(scope);

  const items = useMemo(() => pins.data?.pages.flatMap((page) => page.data) ?? [], [pins.data]);
  const meta = pins.data?.pages.at(-1)?.meta;
  // Tên + ảnh tác giả tra từ danh bạ phạm vi (`MessageView` chỉ có `authorId`) — cùng một lượt tải.
  const authors = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.userId, m])),
    [members.data],
  );
  const error = pins.isError ? describeDiscoveryError(pins.error) : null;
  const noAccess = error?.kind === 'no-access';

  useEffect(() => {
    if (!noAccess) return;
    showToast('info', 'Bạn không còn quyền xem nội dung này.');
    router.back();
  }, [noAccess]);

  const open = useCallback(
    (item: PinnedItem) =>
      openMessage({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        workspaceId: scope.workspaceId,
        messageId: item.id,
        threadRootId: item.threadId,
      }),
    [scope.scopeType, scope.scopeId, scope.workspaceId],
  );
  const remove = useCallback(
    (item: PinnedItem) => {
      hapticTap(); // bỏ ghim = hành động chính của hàng (xem `shared/utils/haptics`)
      unpinMessage(item.id);
    },
    [unpinMessage],
  );
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void pins.refetch(),
    refreshing: pins.isRefetching,
  });

  return (
    <Screen
      header={
        <AppBar
          title={meta ? `Tin đã ghim (${meta.total}/${meta.max})` : 'Tin đã ghim'}
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 py-xs">
        {pins.isLoading ? (
          // Cùng hình `PinnedItemRow` (avatar + tác giả + nội dung), cùng lề `px-md py-sm`.
          <View>
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonParagraphWithIcon key={index} className="px-md py-sm" />
            ))}
          </View>
        ) : error && !noAccess ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void pins.refetch() }]}
            description={error.message}
            icon="alert-warning"
            title="Không tải được tin đã ghim"
            tone="danger"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="Nhấn giữ một tin trong cuộc trò chuyện và chọn Ghim để đặt nó ở đây."
            icon="location"
            title="Chưa có tin nào được ghim"
          />
        ) : (
          <FlashList<PinnedItem>
            contentContainerStyle={{ paddingBottom: 16 }}
            data={items}
            extraData={isUnpinning ? unpinningId : undefined}
            keyExtractor={(item) => item.id}
            ListFooterComponent={pins.isFetchingNextPage ? <LoadingMore /> : null}
            refreshControl={refreshControl}
            renderItem={({ item }) => (
              <PinnedItemRow
                authorAvatarUrl={item.authorId ? authors.get(item.authorId)?.avatarUrl : undefined}
                authorName={item.authorId ? authors.get(item.authorId)?.name : undefined}
                canUnpin={item.myPermissions.canPin}
                item={item}
                unpinning={isUnpinning && unpinningId === item.id}
                onPress={open}
                onUnpin={remove}
              />
            )}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (pins.hasNextPage && !pins.isFetchingNextPage) void pins.fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
          />
        )}
      </View>
    </Screen>
  );
}
