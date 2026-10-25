import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Divider } from '@/shared/ui/divider';
import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { Skeleton } from '@/shared/ui/skeleton';
import { useListRefreshControl } from '@/shared/ui/screen';

import type { ExpenseFilter, ExpenseView } from '../api';
import type { MemberDirectory } from '../hooks/useMemberDirectory';
import { useExpenses } from '../queries/wallet.queries';
import { ExpenseRow } from './ExpenseRow';

export interface HistoryExpenseListProps {
  directory: MemberDirectory;
  filter: ExpenseFilter;
  wsId: string;
  onOpen: (expense: ExpenseView) => void;
}

/** Danh sách khoản chi cuộn vô hạn (cursor). Lọc đổi ⇒ khoá cache đổi ⇒ danh sách mới, không lẫn kết quả cũ. */
export function HistoryExpenseList({ directory, filter, onOpen, wsId }: HistoryExpenseListProps) {
  const query = useExpenses(wsId, filter);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Object.keys(filter).length > 0;
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });

  if (query.isLoading) {
    return (
      <View className="gap-sm px-md">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-md" />
        ))}
      </View>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
        description={toErrorMessage(query.error)}
        icon="alert-warning"
        title="Không tải được"
        tone="danger"
      />
    );
  }

  if (items.length === 0) {
    // Hai ca KHÁC nhau: lọc không khớp (tông trung tính, gợi ý bỏ lọc) ≠ nhóm chưa có khoản chi nào (tông phân hệ ví).
    return (
      <EmptyState
        description={
          filtered
            ? 'Thử bỏ bớt bộ lọc để xem thêm khoản chi.'
            : 'Khoản chi của cả nhóm sẽ hiện ở đây khi có người ghi khoản đầu tiên.'
        }
        icon={filtered ? 'filter' : 'bill'}
        title={filtered ? 'Không có khoản chi khớp bộ lọc' : 'Chưa có khoản chi nào'}
        tone={filtered ? 'neutral' : 'success'}
      />
    );
  }

  return (
    <FlashList<ExpenseView>
      contentContainerStyle={{ paddingBottom: 16 }}
      data={items}
      ItemSeparatorComponent={Divider}
      keyExtractor={(item) => item.id}
      ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <View className="px-md">
          <ExpenseRow
            expense={item}
            meId={directory.meId}
            payerName={directory.isMe(item.paidBy) ? 'Bạn' : directory.nameOf(item.paidBy)}
            onPress={onOpen}
          />
        </View>
      )}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
    />
  );
}
