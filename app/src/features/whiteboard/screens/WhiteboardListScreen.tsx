import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';
import { isNetworkError } from '@/shared/utils/errors/to-error-message';

import type { WhiteboardStatus } from '../api/whiteboard.types';
import { CreateWhiteboardSheet } from '../components/CreateWhiteboardSheet';
import { WhiteboardMenuSheets } from '../components/WhiteboardMenuSheets';
import { WhiteboardRow } from '../components/WhiteboardRow';
import { useWhiteboardList } from '../hooks/useWhiteboardList';
import { whiteboardErrorMessage } from '../utils/whiteboard-errors';

const TABS = [
  { key: 'ACTIVE', label: 'Đang dùng' },
  { key: 'ARCHIVED', label: 'Lưu trữ' },
];

/**
 * Danh sách bảng trắng của nhóm (app.md §3): ô tìm (server), tab "Đang dùng/Lưu trữ", hàng bảng + menu "⋯", nút "Tạo bảng trắng" dính đáy. Trạng thái: tải
 * (6 hàng khung xương) · rỗng ("Chưa có bảng trắng — vẽ sơ đồ đầu tiên" / không tìm thấy / chưa có bản lưu trữ) · lỗi + Thử lại · ngoại tuyến (còn dữ
 * liệu đã tải, ẩn nút tạo). Mất quyền ở mức nhóm do layout `[wsId]` xử lý (`useWorkspaceSocket`). Cờ `collab` tắt → `FeatureRouteGuard`.
 */
export function WhiteboardListScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const list = useWhiteboardList(wsId);
  const { query } = list;
  const offline = useConnectionState() === 'offline';
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });
  const canCreate = list.access?.canCreate === true && !offline && list.status === 'ACTIVE';
  const filtered = list.filter.q !== '';

  // ⛔ Ô tìm + tab nằm NGOÀI danh sách: đổi từ khoá là đổi khoá truy vấn → danh sách chuyển sang khung xương; nếu ô tìm nằm trong `ListHeaderComponent` thì
  // nó bị gỡ/dựng lại theo, mất chữ đang gõ (Telex) và bàn phím đóng.
  const header = (
    <View className="gap-xs px-md pb-xs pt-xs">
      <SearchInput {...list.search.inputProps} placeholder="Tìm theo tên bảng" />
      <Tabs
        items={TABS}
        value={list.status}
        variant="underline"
        onChange={(key) => {
          hapticSelection();
          list.setStatus(key as WhiteboardStatus);
        }}
      />
      {offline ? (
        <Alert description="Đang ngoại tuyến — hiển thị dữ liệu đã tải." tone="warning" />
      ) : null}
      {query.isError && list.items.length > 0 ? (
        <Alert description={whiteboardErrorMessage(query.error)} tone="error" />
      ) : null}
    </View>
  );

  const empty = () => {
    if (query.isError) {
      return (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={whiteboardErrorMessage(query.error)}
          icon={isNetworkError(query.error) ? 'unlink' : 'alert-warning'}
          title="Không tải được danh sách bảng trắng"
          tone="danger"
        />
      );
    }
    if (filtered) {
      return (
        <EmptyState
          description="Thử từ khoá khác."
          icon="search"
          title="Không tìm thấy bảng trắng nào"
          tone="accent"
        />
      );
    }
    if (list.status === 'ARCHIVED') {
      return (
        <EmptyState
          description="Bảng đã lưu trữ sẽ nằm ở đây, khôi phục lại được bất cứ lúc nào."
          icon="edit"
          title="Chưa có bảng lưu trữ"
          tone="neutral"
        />
      );
    }
    return (
      <EmptyState
        actions={
          canCreate ? [{ label: 'Tạo bảng trắng', onPress: () => list.setCreating(true) }] : undefined
        }
        description="Vẽ sơ đồ, ghi chú, phác thảo ý tưởng chung với cả nhóm theo thời gian thực."
        icon="edit"
        title="Chưa có bảng trắng — vẽ sơ đồ đầu tiên"
        tone="brand"
      />
    );
  };

  return (
    <Screen
      footer={
        canCreate ? (
          <BottomActionBar>
            <Button
              fullWidth
              iconLeft="add"
              label="Tạo bảng trắng"
              onPress={() => list.setCreating(true)}
            />
          </BottomActionBar>
        ) : undefined
      }
      header={<AppBar title="Bảng trắng" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      {header}
      <View className="flex-1">
        {query.isLoading ? (
          // Khung xương đúng dáng hàng thật (ô icon + hai dòng chữ), cùng lề 16 với hàng.
          <View className="gap-lg px-md py-sm">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <SkeletonParagraphWithIcon key={index} />
            ))}
          </View>
        ) : (
          <FlashList
            contentContainerStyle={{ paddingBottom: 24 }}
            data={list.items}
            keyExtractor={(board) => board.id}
            ListEmptyComponent={empty}
            ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
            refreshControl={refreshControl}
            renderItem={({ item }) => (
              <WhiteboardRow board={item} onMenu={list.menu.open} onOpen={list.open} />
            )}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
          />
        )}
      </View>
      <CreateWhiteboardSheet
        visible={list.creating}
        wsId={wsId}
        onClose={() => list.setCreating(false)}
        onCreated={list.openCreated}
      />
      <WhiteboardMenuSheets list={list} />
    </Screen>
  );
}
