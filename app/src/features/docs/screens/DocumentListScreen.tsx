import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { isNetworkError } from '@/shared/utils/errors/to-error-message';
import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Button } from '@/shared/ui/button';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import type { DocumentStatus } from '../api/docs.types';
import { CreateDocumentSheet } from '../components/CreateDocumentSheet';
import { DocumentMenuSheets } from '../components/DocumentMenuSheets';
import { DocumentRow } from '../components/DocumentRow';
import { useDocumentList } from '../hooks/useDocumentList';
import { docsErrorMessage } from '../utils/docs-errors';

const TABS = [
  { key: 'ACTIVE', label: 'Đang dùng' },
  { key: 'ARCHIVED', label: 'Lưu trữ' },
];

/**
 * Danh sách tài liệu của nhóm (app.md §3): ô tìm (server), tab "Đang dùng/Lưu trữ", hàng tài liệu + menu "⋯", nút "Tạo tài liệu" dính đáy.
 * Trạng thái: tải (6 hàng khung xương) · rỗng (mời tạo báo cáo đầu tiên / không tìm thấy / chưa có bản lưu trữ) · lỗi + Thử lại · ngoại tuyến
 * (còn dữ liệu đã tải, ẩn nút tạo). Mất quyền ở mức nhóm do layout `[wsId]` xử lý (`useWorkspaceSocket`). Cờ `collab` tắt → `FeatureRouteGuard`.
 */
export function DocumentListScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const list = useDocumentList(wsId);
  const { query } = list;
  const offline = useConnectionState() === 'offline';
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });
  const canCreate = list.access?.canCreate === true && !offline && list.status === 'ACTIVE';
  const filtered = list.filter.q !== '';

  // ⛔ Ô tìm + tab nằm NGOÀI danh sách: đổi từ khoá là đổi khoá truy vấn → danh sách chuyển sang khung xương; nếu ô tìm nằm trong
  // `ListHeaderComponent` thì nó bị gỡ/dựng lại theo, mất chữ đang gõ (Telex) và bàn phím đóng.
  const header = (
    <View className="gap-xs px-md pb-xs pt-xs">
      <SearchInput {...list.search.inputProps} placeholder="Tìm theo tiêu đề" />
      <Tabs
        items={TABS}
        value={list.status}
        variant="underline"
        onChange={(key) => {
          hapticSelection();
          list.setStatus(key as DocumentStatus);
        }}
      />
      {offline ? (
        <Alert description="Đang ngoại tuyến — hiển thị dữ liệu đã tải." tone="warning" />
      ) : null}
      {query.isError && list.items.length > 0 ? (
        <Alert description={docsErrorMessage(query.error)} tone="error" />
      ) : null}
    </View>
  );

  const empty = () => {
    if (query.isError) {
      return (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={docsErrorMessage(query.error)}
          icon={isNetworkError(query.error) ? 'unlink' : 'alert-warning'}
          title="Không tải được danh sách tài liệu"
          tone="danger"
        />
      );
    }
    if (filtered) {
      return (
        <EmptyState
          description="Thử từ khoá khác."
          icon="search"
          title="Không tìm thấy tài liệu nào"
          tone="accent"
        />
      );
    }
    if (list.status === 'ARCHIVED') {
      return (
        <EmptyState
          description="Tài liệu đã lưu trữ sẽ nằm ở đây, khôi phục lại được bất cứ lúc nào."
          icon="document"
          title="Chưa có tài liệu lưu trữ"
          tone="neutral"
        />
      );
    }
    return (
      <EmptyState
        actions={
          canCreate ? [{ label: 'Tạo tài liệu', onPress: () => list.setCreating(true) }] : undefined
        }
        description="Soạn chung với cả nhóm theo thời gian thực, thấy con trỏ của nhau."
        icon="document"
        title="Chưa có tài liệu — tạo báo cáo đầu tiên"
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
              label="Tạo tài liệu"
              onPress={() => list.setCreating(true)}
            />
          </BottomActionBar>
        ) : undefined
      }
      header={<AppBar title="Tài liệu cộng tác" onBack={router.back} />}
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
            keyExtractor={(doc) => doc.id}
            ListEmptyComponent={empty}
            ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
            refreshControl={refreshControl}
            renderItem={({ item }) => (
              <DocumentRow doc={item} onMenu={list.menu.open} onOpen={list.open} />
            )}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
          />
        )}
      </View>
      <CreateDocumentSheet
        visible={list.creating}
        wsId={wsId}
        onClose={() => list.setCreating(false)}
        onCreated={list.openCreated}
      />
      <DocumentMenuSheets list={list} />
    </Screen>
  );
}
