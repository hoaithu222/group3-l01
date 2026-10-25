import { FlashList } from '@shopify/flash-list';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import {
  savedKeys,
  useSaveActions,
  useSavedMessagesStore,
  type SavedScopeFilter,
} from '@/shared/saved';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { LoadingMore } from '@/shared/ui/progress';
import { hapticTap } from '@/shared/utils/haptics';

import type { SavedItem, SavedPage, WorkspaceOption } from '../api/discovery.types';
import { SavedFilterChips } from '../components/SavedFilterChips';
import { SavedItemRow } from '../components/SavedItemRow';
import { flattenSavedIds, removeSavedMessage, useSavedList } from '../queries/saved.queries';
import { openMessage } from '../utils/open-message';

/**
 * "Đã lưu" (tab Tôi → `/me/saved`, app.md p1-09 §3): lọc theo loại/nhóm, phân trang cursor, chạm → mở tin gốc
 * (`?m=` → `around`), bỏ lưu từng mục. Mục KHÔNG khả dụng vẫn nằm trong danh sách (BE không xoá bản ghi lưu khi mất quyền) và
 * chỉ có "Bỏ lưu" — người dùng tự dọn, không mất mục âm thầm. Realtime `saved:updated` do `useSavedSync` (mount ở
 * `(app)/_layout`) làm mới danh sách này qua `savedKeys.all`.
 */
export function SavedScreen() {
  const queryClient = useQueryClient();
  const { setSaved } = useSaveActions();
  const [scopeType, setScopeType] = useState<SavedScopeFilter | undefined>();
  const [workspace, setWorkspace] = useState<WorkspaceOption | null>(null);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);

  const filter = useMemo(() => ({ scopeType, workspaceId: workspace?.id }), [scopeType, workspace]);
  const list = useSavedList(filter);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void list.refetch(),
    refreshing: list.isRefetching,
  });

  // Mọi mục trong danh sách đều là tin ĐÃ lưu — nạp vào tập cờ của menu tin (`MessageView` chưa có `isSaved`).
  useEffect(() => {
    useSavedMessagesStore.getState().markMany(flattenSavedIds(list.data));
  }, [list.data]);

  const open = useCallback((item: SavedItem) => {
    if (!item.available) return;
    openMessage({
      scopeType: item.scopeType,
      scopeId: item.scopeId,
      workspaceId: item.workspaceId,
      messageId: item.messageId,
      threadRootId: item.message.threadId,
    });
  }, []);

  const unsave = useCallback(
    async (item: SavedItem) => {
      hapticTap(); // bỏ lưu = hành động chính của hàng (cùng họ "thả tim/ghim")
      setUnsavingId(item.messageId);
      const ok = await setSaved(item.messageId, false);
      setUnsavingId(null);
      // Xoá dòng NGAY thay vì đợi refetch (`setSaved` đã `invalidate` để đối chiếu với server).
      if (ok) {
        queryClient.setQueriesData<InfiniteData<SavedPage>>({ queryKey: savedKeys.all }, (data) =>
          removeSavedMessage(data, item.messageId),
        );
      }
    },
    [queryClient, setSaved],
  );

  return (
    <Screen
      header={<AppBar title="Đã lưu" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-sm py-xs">
        <SavedFilterChips
          scopeType={scopeType}
          workspace={workspace}
          onScopeTypeChange={setScopeType}
          onWorkspaceChange={setWorkspace}
        />

        <View className="flex-1">
          {list.isLoading ? (
            // Cùng hình `SavedItemRow` (avatar + người gửi + trích đoạn), cùng lề `px-md py-sm`.
            <View>
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonParagraphWithIcon key={index} className="px-md py-sm" />
              ))}
            </View>
          ) : list.isError && items.length === 0 ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void list.refetch() }]}
              description={toErrorMessage(list.error)}
              icon="alert-warning"
              title="Không tải được tin đã lưu"
              tone="danger"
            />
          ) : items.length === 0 ? (
            <EmptyState
              description={
                scopeType || workspace ? 'Thử bỏ bớt bộ lọc.' : 'Nhấn giữ một tin và chọn Lưu.'
              }
              icon={scopeType || workspace ? 'search' : 'favorite'}
              title={
                scopeType || workspace ? 'Không có tin nào khớp bộ lọc' : 'Chưa có tin nào được lưu'
              }
              // `warning` (vàng cam) = cùng tông ô "Đã lưu" ở màn Tôi — người dùng đi từ đó vào.
              tone={scopeType || workspace ? 'neutral' : 'warning'}
            />
          ) : (
            <FlashList<SavedItem>
              contentContainerStyle={{ paddingBottom: 16 }}
              data={items}
              extraData={unsavingId}
              keyExtractor={(item) => item.messageId}
              ListFooterComponent={list.isFetchingNextPage ? <LoadingMore /> : null}
              refreshControl={refreshControl}
              renderItem={({ item }) => (
                <SavedItemRow
                  item={item}
                  unsaving={unsavingId === item.messageId}
                  onOpen={open}
                  onUnsave={unsave}
                />
              )}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              testID="saved-list"
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
