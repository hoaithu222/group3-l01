import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { isNetworkError } from '@/shared/utils/errors';

import type { CoinTxType } from '../api/coins.types';
import { CoinsNote } from '../components/CoinsNote';
import { TransactionRow } from '../components/TransactionRow';
import { WalletHeader } from '../components/WalletHeader';
import { coinsKeys } from '../queries/coins.keys';
import { useTransactions } from '../queries/wallet.queries';

/**
 * "Xu của tôi" (app.md p7-02 §3): số dư, nhiệm vụ ngày, lịch sử có lọc loại (cursor, mới → cũ). Cả màn là MỘT `FlatList` (phần đầu ở `WalletHeader`) nên lịch sử
 * dài vẫn ảo hoá. Kéo-để-làm-mới tải lại ví + nhiệm vụ + lịch sử của tab đang xem (các tab khác đánh dấu cũ, tải lười khi mở).
 * Lịch sử rỗng nói cách kiếm xu; lỗi tải có "Thử lại" (nhưng nếu đã có trang cũ thì giữ nguyên trang, không thay bằng khối lỗi).
 */
export function WalletScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('ALL');
  const type = filter === 'ALL' ? undefined : (filter as CoinTxType);
  const history = useTransactions(type);
  const rows = history.data?.pages.flatMap((page) => page.data) ?? [];

  const refreshControl = useListRefreshControl({
    onRefresh: () => void queryClient.invalidateQueries({ queryKey: coinsKeys.all }),
    refreshing: history.isRefetching && !history.isFetchingNextPage,
  });

  let empty: ReactNode;
  if (history.isLoading) {
    empty = <ScreenState fullscreen={false} state="loading" />;
  } else if (history.isError) {
    empty = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void history.refetch() }}
        fullscreen={false}
        state={isNetworkError(history.error) ? 'offline' : 'error'}
        title="Không tải được lịch sử xu"
      />
    );
  } else {
    empty = (
      <ScreenState
        description="Hoàn thành công việc đúng hạn hoặc ôn tập để nhận xu."
        fullscreen={false}
        icon="history"
        state="empty"
        title="Chưa có giao dịch xu"
      />
    );
  }

  return (
    <Screen
      header={<AppBar title="Xu của tôi" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      {/* Trần 720dp cho máy tính bảng do `Screen` lo (`constrained`) — ⛔ đừng kẹp thêm ở đây. */}
      <View className="w-full flex-1">
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={empty}
          ListFooterComponent={
            <View className="gap-md p-md">
              {history.hasNextPage ? (
                <Button
                  label="Xem thêm"
                  loading={history.isFetchingNextPage}
                  size="sm"
                  variant="secondary"
                  onPress={() => void history.fetchNextPage()}
                />
              ) : null}
              <CoinsNote />
            </View>
          }
          ListHeaderComponent={<WalletHeader filter={filter} onFilterChange={setFilter} />}
          refreshControl={refreshControl}
          renderItem={({ item }) => <TransactionRow tx={item} />}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Screen>
  );
}
