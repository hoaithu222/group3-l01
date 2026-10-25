import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { SPACING, useResponsiveValue } from '@/shared/theme';
import { EmptyState, type EmptyStateActionProps } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { Skeleton, SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { useListRefreshControl } from '@/shared/ui/screen';

import type { ExplorerData } from '../hooks/useExplorerData';
import type { ExplorerItem } from '../utils/explorer-items';
import type { ViewMode } from '../utils/explorer-prefs';
import { ResourceGridItem } from './ResourceGridItem';
import { ResourceListItem } from './ResourceListItem';

export interface ExplorerListProps {
  data: ExplorerData;
  /** Hành động của trạng thái rỗng — đã lọc theo quyền/mạng (rỗng ⇒ không nút). */
  emptyActions: readonly EmptyStateActionProps[];
  onClearSearch: () => void;
  onLeave: () => void;
  onMore: (item: ExplorerItem) => void;
  onOpen: (item: ExplorerItem) => void;
  view: ViewMode;
}

/**
 * Vùng nội dung của FileExplorer: tải · lỗi · rỗng · mất quyền · danh sách
 * (app.md p3-01 §3). Lưới 2 cột điện thoại / 4 cột máy tính bảng; `key` đổi theo
 * số cột vì FlashList không cho đổi `numColumns` tại chỗ.
 */
export function ExplorerList({
  data,
  emptyActions,
  onClearSearch,
  onLeave,
  onMore,
  onOpen,
  view,
}: ExplorerListProps) {
  const gridColumns = useResponsiveValue({ base: 2, tablet: 4 });
  const columns = view === 'grid' ? gridColumns : 1;
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: data.refetch,
    refreshing: data.isRefetching,
  });

  if (data.forbidden) {
    return (
      <EmptyState
        actions={[{ label: 'Về nhóm', onPress: onLeave }]}
        description="Thư mục không còn hoặc bạn không có quyền xem."
        icon="lock"
        title="Không truy cập được thư mục này"
        tone="warning"
      />
    );
  }
  if (data.isLoading) {
    return (
      <View className="flex-row flex-wrap px-sm">
        {/* Ô giữ chỗ khớp số cột của lưới THẬT (2 điện thoại / 4 máy tính bảng): lệch thì lúc dữ liệu về, lưới nhảy từ 2 cột
            sang 4 cột ngay trước mắt người dùng. */}
        {Array.from({ length: 6 }).map((_, index) => (
          <View key={index} className={view === 'grid' ? 'w-1/2 p-xs tablet:w-1/4' : 'w-full p-xs'}>
            {/* Danh sách: ô tròn + hai dòng chữ đúng dáng hàng thật (ô icon · tên · dòng phụ), không phải một khối chữ nhật trơn. */}
            {view === 'grid' ? (
              <Skeleton className="h-36 rounded-sm" />
            ) : (
              <SkeletonParagraphWithIcon className="px-xs py-2xs" />
            )}
          </View>
        ))}
      </View>
    );
  }
  if (data.error && data.items.length === 0) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: data.refetch }]}
        description={toErrorMessage(data.error)}
        icon="alert-warning"
        title="Không tải được tài liệu"
        tone="danger"
      />
    );
  }
  if (data.items.length === 0) {
    return data.searching ? (
      <EmptyState
        actions={[{ label: 'Xoá tìm kiếm', onPress: onClearSearch, variant: 'secondary' }]}
        description="Thử từ khoá khác hoặc bỏ bộ lọc loại tệp."
        icon="search"
        title="Không tìm thấy"
        tone="neutral"
      />
    ) : (
      <EmptyState
        actions={emptyActions}
        description="Tải tệp lên hoặc tạo thư mục để bắt đầu."
        icon="document"
        title="Chưa có tài liệu"
        // Cùng tông `warning` với ô "Kho tài liệu" ở hub nhóm (`ResourcesHubCard`) — cùng một phân hệ, cùng một màu.
        tone="warning"
      />
    );
  }

  return (
    <FlashList<ExplorerItem>
      key={`${view}-${columns}`}
      contentContainerStyle={{ paddingBottom: SPACING.md, paddingHorizontal: SPACING.xs }}
      data={data.items}
      keyExtractor={(item) => item.key}
      // Trang kế đang về: vòng quay theo token ở chân danh sách (trước đây không có gì — cuộn tới đáy tưởng đã hết).
      ListFooterComponent={data.isFetchingNextPage ? <LoadingMore /> : null}
      numColumns={columns}
      refreshControl={refreshControl}
      renderItem={({ item }) =>
        view === 'grid' ? (
          <ResourceGridItem item={item} onMore={onMore} onPress={onOpen} />
        ) : (
          <ResourceListItem item={item} onMore={onMore} onPress={onOpen} />
        )
      }
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onEndReached={() => {
        if (data.hasNextPage && !data.isFetchingNextPage) data.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
    />
  );
}
