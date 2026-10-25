import { FlashList } from '@shopify/flash-list';
import { useEffect } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { LoadingMore } from '@/shared/ui/progress';

import type { ReceiptItem, ReceiptStatus } from '../api/announcements.types';
import type { useAnnouncementReceipts } from '../queries/receipts.queries';
import { describeAnnouncementError } from '../utils/error-info';
import { ReceiptRow } from './ReceiptRow';

export interface ReceiptsListProps {
  receipts: ReturnType<typeof useAnnouncementReceipts>;
  status: ReceiptStatus;
}

const EMPTY_COPY: Record<ReceiptStatus, { description: string; title: string }> = {
  confirmed: {
    description: 'Khi có người bấm "Tôi đã đọc", họ sẽ hiện ở đây.',
    title: 'Chưa ai xác nhận',
  },
  pending: {
    description: 'Không còn ai cần xác nhận tin này.',
    title: 'Mọi người đã xác nhận',
  },
};

/**
 * Thân danh sách một tab: khung chờ · lỗi (thử lại) · rỗng · danh sách cursor.
 *
 * `isPlaceholderData` (đổi tab, tab mới đang tải): ẨN dòng của tab cũ dù `data` còn đó — chỉ số đếm ở `ReceiptsSummary` được
 * giữ. BE lọc người đã mất quyền đọc kênh KHỎI trang "đã xác nhận" nên một trang có thể ít dòng (thậm chí 0) mà `hasMore` vẫn
 * `true` — danh sách rỗng mà còn trang sau thì tự tải tiếp, không kết luận "Chưa ai xác nhận" sớm.
 */
export function ReceiptsList({ receipts, status }: ReceiptsListProps) {
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = receipts;
  const loading = receipts.isPending || receipts.isPlaceholderData;
  const items: ReceiptItem[] = loading
    ? []
    : (receipts.data?.pages.flatMap((page) => page.data) ?? []);
  const drainingEmptyPage = !loading && items.length === 0 && hasNextPage;
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void receipts.refetch(),
    refreshing: receipts.isRefetching && !isFetchingNextPage,
  });

  useEffect(() => {
    if (drainingEmptyPage && !isFetchingNextPage) void fetchNextPage();
  }, [drainingEmptyPage, isFetchingNextPage, fetchNextPage]);

  if (loading || drainingEmptyPage) {
    return (
      // Khung xương ĐÚNG dáng `ReceiptRow` (avatar 40 + tên + dòng giờ, cùng `px-md py-xs`) — dữ liệu về không nhảy bố cục.
      <View accessibilityLabel="Đang tải danh sách" accessible className="pt-xs">
        {Array.from({ length: 5 }, (_, index) => (
          <View key={index} className="min-h-14 flex-row items-center gap-sm px-md py-xs">
            <Skeleton className="h-10 w-10" variant="circle" />
            <View className="flex-1 gap-xs">
              <Skeleton width="45%" />
              <Skeleton width="60%" />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (receipts.isError) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void receipts.refetch() }]}
        description={describeAnnouncementError(receipts.error).message}
        icon="alert-warning"
        title="Không tải được danh sách"
        tone="danger"
      />
    );
  }

  if (items.length === 0)
    return (
      <EmptyState
        {...EMPTY_COPY[status]}
        icon={status === 'confirmed' ? 'contact-list' : 'checkmark-circle'}
        tone={status === 'confirmed' ? 'info' : 'success'}
      />
    );

  return (
    <FlashList<ReceiptItem>
      contentContainerStyle={{ paddingBottom: 16 }}
      data={items}
      keyExtractor={(item) => item.userId}
      ListFooterComponent={isFetchingNextPage ? <LoadingMore /> : null}
      refreshControl={refreshControl}
      renderItem={({ item }) => <ReceiptRow item={item} />}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
    />
  );
}
