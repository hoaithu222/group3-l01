import { FlashList } from '@shopify/flash-list';
import { ScrollView, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Chip } from '@/shared/ui/chip';
import { Divider } from '@/shared/ui/divider';
import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { Skeleton } from '@/shared/ui/skeleton';
import { useListRefreshControl } from '@/shared/ui/screen';
import { hapticSelection } from '@/shared/utils/haptics';

import type { SettlementFilter, SettlementStatus, SettlementView } from '../api';
import { SETTLEMENT_STATUS_LABEL } from '../constants/wallet.constants';
import type { MemberDirectory } from '../hooks/useMemberDirectory';
import { useSettlements } from '../queries/wallet.queries';
import { SettlementRow } from './SettlementRow';

export interface HistorySettlementListProps {
  directory: MemberDirectory;
  filter: SettlementFilter;
  wsId: string;
  onFilterChange: (next: SettlementFilter) => void;
}

const STATUSES = Object.keys(SETTLEMENT_STATUS_LABEL) as SettlementStatus[];

/** Lịch sử thanh toán: lọc theo trạng thái + "Của tôi", cuộn vô hạn. */
export function HistorySettlementList({
  directory,
  filter,
  onFilterChange,
  wsId,
}: HistorySettlementListProps) {
  const query = useSettlements(wsId, filter);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });

  const chips = (
    // `grow-0`: ScrollView NGANG mặc định `flexGrow: 1` — cạnh `View flex-1` chứa danh sách thì chip bị kéo cao ~nửa màn.
    <ScrollView
      className="grow-0"
      contentContainerClassName="flex-row items-center gap-xs px-md py-2xs"
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <Chip
        label="Của tôi"
        role="checkbox"
        selected={filter.mine === true}
        onPress={() => {
          hapticSelection();
          onFilterChange({ ...filter, mine: filter.mine ? undefined : true });
        }}
      />
      {STATUSES.map((status) => (
        <Chip
          key={status}
          label={SETTLEMENT_STATUS_LABEL[status]}
          role="radio"
          selected={filter.status === status}
          onPress={() => {
            hapticSelection();
            onFilterChange({ ...filter, status: filter.status === status ? undefined : status });
          }}
        />
      ))}
    </ScrollView>
  );

  let body;
  if (query.isLoading) {
    body = (
      <View className="gap-sm px-md">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-md" />
        ))}
      </View>
    );
  } else if (query.isError) {
    body = (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
        description={toErrorMessage(query.error)}
        icon="alert-warning"
        title="Không tải được"
        tone="danger"
      />
    );
  } else if (items.length === 0) {
    const filtered = filter.mine === true || filter.status !== undefined;
    body = (
      <EmptyState
        description={
          filtered
            ? 'Thử bỏ bớt bộ lọc để xem thêm khoản thanh toán.'
            : 'Khi có người trả nợ trong nhóm, khoản thanh toán sẽ hiện ở đây.'
        }
        icon={filtered ? 'filter' : 'wallet-add'}
        title={filtered ? 'Không có thanh toán khớp bộ lọc' : 'Chưa có khoản thanh toán nào'}
        tone={filtered ? 'neutral' : 'success'}
      />
    );
  } else {
    body = (
      <FlashList<SettlementView>
        contentContainerStyle={{ paddingBottom: 16 }}
        data={items}
        ItemSeparatorComponent={Divider}
        keyExtractor={(item) => item.id}
        ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <View className="px-md">
            <SettlementRow meId={directory.meId} nameOf={directory.nameOf} settlement={item} />
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

  return (
    <View className="flex-1">
      {chips}
      <View className="flex-1">{body}</View>
    </View>
  );
}
