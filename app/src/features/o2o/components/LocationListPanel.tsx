import { FlashList } from '@shopify/flash-list';
import type { UseQueryResult } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError, toErrorMessage } from '@/shared/utils/errors';

import type { NearLocation } from '../api/o2o.types';
import { formatRadius } from '../utils/geo';
import { LocationRow } from './LocationRow';

/** Khe 12dp giữa hai dòng (`gap-sm`, screen-layout.md) — hàm cấp module, không dựng lại mỗi lần vẽ. */
function Separator() {
  return <View className="h-3" />;
}

export interface LocationListPanelProps {
  query: UseQueryResult<NearLocation[]>;
  items: NearLocation[];
  radiusM: number;
  /** Còn bậc bán kính lớn hơn để "Mở rộng bán kính". */
  canExpand: boolean;
  /** Đang có bộ lọc — rỗng thì gợi ý "Xoá bộ lọc" (lọc quá chặt thường là lý do, không phải "không có quán nào"). */
  filtered: boolean;
  selectedId: string | null;
  onExpand: () => void;
  onClearFilters: () => void;
  onOpen: (item: NearLocation) => void;
}

/**
 * Danh sách địa điểm (app.md §2 `LocationListSheet` — bản DÍNH dưới bản đồ trên điện thoại, cột phải trên máy tính bảng: không dựng tờ kéo
 * lên vì `BottomSheet` chung là hộp thoại phủ, không cuộn cùng bản đồ). Đủ bốn trạng thái: khung xương · lỗi (mất mạng ≠ lỗi khác) · rỗng
 * ("mở rộng bán kính") · có dữ liệu. Danh sách CŨ giữ nguyên khi kéo bản đồ/đổi lọc (`keepPreviousData` ở query) — không nháy khung xương.
 */
export function LocationListPanel({
  query,
  items,
  radiusM,
  canExpand,
  filtered,
  selectedId,
  onExpand,
  onClearFilters,
  onOpen,
}: LocationListPanelProps) {
  // Hook ở đầu component, ⛔ không sau `return` sớm (quy tắc hook).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isPlaceholderData,
  });

  if (query.isPending) {
    return (
      <View className="gap-sm px-md pt-xs">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-28 rounded-md" />
        ))}
      </View>
    );
  }

  if (query.isError && items.length === 0) {
    return (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
        description={toErrorMessage(query.error)}
        fullscreen={false}
        state={isNetworkError(query.error) ? 'offline' : 'error'}
      />
    );
  }

  if (items.length === 0) {
    const actions = [
      ...(canExpand ? [{ label: 'Mở rộng bán kính', onPress: onExpand }] : []),
      ...(filtered ? [{ label: 'Xoá bộ lọc', onPress: onClearFilters }] : []),
    ];
    return (
      <EmptyState
        actions={actions}
        description={
          canExpand
            ? 'Thử mở rộng bán kính tìm kiếm hoặc kéo bản đồ sang khu vực khác.'
            : 'Hãy kéo bản đồ sang khu vực khác hoặc bỏ bớt bộ lọc.'
        }
        icon="location"
        size="compact"
        title={`Không có địa điểm trong ${formatRadius(radiusM)}`}
        tone="neutral"
      />
    );
  }

  return (
    <FlashList<NearLocation>
      contentContainerStyle={{ paddingBottom: 24 }}
      data={items}
      ItemSeparatorComponent={Separator}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <Text className="px-md pb-xs text-caption-lg text-fg-2">
          {items.length} địa điểm trong bán kính {formatRadius(radiusM)}
        </Text>
      }
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <View className="px-md">
          <LocationRow item={item} selected={item.id === selectedId} onPress={() => onOpen(item)} />
        </View>
      )}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    />
  );
}
