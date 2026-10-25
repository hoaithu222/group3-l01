import { FlashList } from '@shopify/flash-list';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { useListRefreshControl } from '@/shared/ui/screen';

import type { CallHistoryFilter, CallHistoryItem as HistoryItem } from '../api/calls.types';
import type { useCallHistory } from '../queries/calls.queries';
import { CallHistoryItem } from './CallHistoryItem';
import { CallHistorySkeleton } from './CallHistorySkeleton';

interface Props {
  filter: CallHistoryFilter;
  history: ReturnType<typeof useCallHistory>;
  items: HistoryItem[];
  onCallBack: (item: HistoryItem) => void;
  onOpen: (item: HistoryItem) => void;
}

/** Thân danh sách lịch sử: skeleton → lỗi (Thử lại tại chỗ) → rỗng theo bộ lọc → danh sách phân trang cursor. */
export function CallHistoryScreenBody({ filter, history, items, onCallBack, onOpen }: Props) {
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void history.refetch(),
    refreshing: history.isRefetching,
  });
  if (history.isLoading) return <CallHistorySkeleton />;
  if (history.isError && items.length === 0) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void history.refetch() }]}
        description={toErrorMessage(history.error)}
        icon="alert-warning"
        title="Không tải được lịch sử"
        tone="danger"
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        description={filter === 'missed' ? 'Các cuộc gọi nhỡ sẽ hiện ở đây.' : 'Lịch sử cuộc gọi sẽ hiện ở đây.'}
        // Không có cuộc gọi nhỡ là TIN TỐT ⇒ dấu tích xanh; chưa gọi lần nào ⇒ điện thoại xanh dương.
        icon={filter === 'missed' ? 'checkmark-circle' : 'phone'}
        title={filter === 'missed' ? 'Không có cuộc gọi nhỡ' : 'Chưa có cuộc gọi nào'}
        tone={filter === 'missed' ? 'success' : 'info'}
      />
    );
  }
  return (
    <FlashList<HistoryItem>
      contentContainerStyle={{ paddingBottom: 16 }}
      data={items}
      keyExtractor={(item) => `${item.callId}`}
      // Chân danh sách khi đang tải THÊM trang — không có nó, cuộn tới đáy chỉ thấy khoảng trống trong lúc chờ.
      ListFooterComponent={history.isFetchingNextPage ? <LoadingMore /> : null}
      refreshControl={refreshControl}
      renderItem={({ item }) => <CallHistoryItem item={item} onCallBack={onCallBack} onOpen={onOpen} />}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onEndReached={() => {
        if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
    />
  );
}
