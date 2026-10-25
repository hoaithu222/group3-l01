import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError, toErrorMessage } from '@/shared/utils/errors';

import type { OrderGroup, PrintOrderView } from '../api/o2o.types';
import { O2O_TONE } from '../constants/o2o.constants';
import { useMyPrintOrders } from '../queries/print.queries';
import { O2O_MAP_HREF, orderTicketHref } from '../utils/o2o-routes';
import { PrintOrderRow } from './PrintOrderRow';

const EMPTY_TEXT: Record<OrderGroup, { title: string; description: string }> = {
  ACTIVE: {
    title: 'Chưa có đơn in',
    description:
      'Tìm một tiệm in gần bạn, chọn tệp PDF và gửi đơn — theo dõi trạng thái ngay ở đây.',
  },
  DONE: { title: 'Chưa có đơn hoàn tất', description: 'Đơn đã nhận tài liệu sẽ nằm ở đây.' },
  CLOSED: {
    title: 'Chưa có đơn nào bị huỷ',
    description: 'Đơn bị huỷ, bị tiệm từ chối hoặc hết hạn sẽ nằm ở đây.',
  },
};

/** Khe 12dp giữa hai dòng — hàm cấp module, không dựng lại mỗi lần vẽ. */
function Separator() {
  return <View className="h-3" />;
}

/** Danh sách đơn của MỘT nhóm trạng thái (cursor, cuộn vô hạn). Đủ khung xương · lỗi (mất mạng ≠ lỗi khác) · rỗng · dữ liệu; kéo để làm mới. */
export function OrdersList({ group }: { group: OrderGroup }) {
  const query = useMyPrintOrders(group);
  const orders: PrintOrderView[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });

  if (query.isPending) {
    // Cao bằng thẻ đơn thật (bốn dòng chữ + `p-md` ≈ 128dp) để danh sách không nhảy lúc dữ liệu về.
    return (
      <View className="gap-sm px-md pt-xs">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-32 rounded-md" />
        ))}
      </View>
    );
  }

  if (query.isError) {
    return (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
        description={toErrorMessage(query.error)}
        fullscreen={false}
        state={isNetworkError(query.error) ? 'offline' : 'error'}
      />
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        actions={
          group === 'ACTIVE'
            ? [{ label: 'Tìm tiệm in', onPress: () => router.push(O2O_MAP_HREF) }]
            : undefined
        }
        description={EMPTY_TEXT[group].description}
        icon={group === 'CLOSED' ? 'cancel-2' : group === 'DONE' ? 'tick-double-01' : 'document-2'}
        size="compact"
        title={EMPTY_TEXT[group].title}
        // Rỗng RIÊNG của phân hệ (chưa đặt in) ⇒ tông phân hệ; hai nhóm còn lại là "chưa có gì" trung tính.
        tone={group === 'ACTIVE' ? O2O_TONE : 'neutral'}
      />
    );
  }

  return (
    <FlashList<PrintOrderView>
      contentContainerStyle={{ paddingBottom: 24, paddingTop: 4 }}
      data={orders}
      ItemSeparatorComponent={Separator}
      keyExtractor={(order) => order.id}
      ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <View className="px-md">
          <PrintOrderRow order={item} onPress={() => router.push(orderTicketHref(item.id))} />
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
