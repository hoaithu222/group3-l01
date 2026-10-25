import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import type { MyReviewItemDto, MyReviewsStatus } from '../api/reviews.types';
import { MyReviewRow } from '../components/review/MyReviewRow';
import { useMyReviewsScreen } from '../hooks/useMyReviewsScreen';

const TAB_ITEMS = [
  { key: 'PENDING', label: 'Cần chấm' },
  { key: 'SUBMITTED', label: 'Đã chấm' },
];

const EMPTY: Record<MyReviewsStatus, { description: string; title: string }> = {
  PENDING: { description: 'Khi bạn được giao chấm một thẻ, thẻ sẽ hiện ở đây.', title: 'Không có thẻ cần chấm' },
  SUBMITTED: { description: 'Các thẻ bạn đã chấm sẽ hiện ở đây.', title: 'Chưa chấm thẻ nào' },
};

/**
 * "Cần chấm của tôi" (p4-05 app.md §3 `MyReviews`, route `me/reviews`): hai tab Cần chấm · Đã chấm, mỗi hàng là một thẻ — tiêu đề, nhóm · bảng,
 * "được giao 2 giờ trước", lượt "1/2". Rỗng · khung xương · lỗi + "Thử lại"; kéo để làm mới; cuộn tới cuối tải thêm trang (cursor).
 * Offline: hiện cache đã có (React Query), không xoá.
 */
export function MyReviewsScreen() {
  const s = useMyReviewsScreen();
  const { list } = s;
  const refreshControl = useListRefreshControl({
    onRefresh: () => void list.refetch(),
    refreshing: list.isRefetching && !list.isFetchingNextPage,
  });

  return (
    <Screen header={<AppBar title="Cần chấm của tôi" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="flex-1 gap-xs py-xs">
        <View className="px-md">
          <Tabs
            items={TAB_ITEMS}
            value={s.tab}
            onChange={(key) => {
              hapticSelection();
              s.setTab(key as MyReviewsStatus);
            }}
          />
        </View>

        <View className="flex-1">
          {list.isLoading ? (
            // Khung xương đúng dáng hàng thật: ô icon + hai dòng chữ.
            <View className="gap-lg px-md py-sm">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonParagraphWithIcon key={index} />
              ))}
            </View>
          ) : list.isError && s.items.length === 0 ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void list.refetch() }]}
              description={toErrorMessage(list.error)}
              icon="alert-warning"
              title="Không tải được danh sách"
              tone="danger"
            />
          ) : s.items.length === 0 ? (
            <EmptyState
              description={EMPTY[s.tab].description}
              icon="checkmark-square"
              title={EMPTY[s.tab].title}
              tone="info"
            />
          ) : (
            <FlashList<MyReviewItemDto>
              contentContainerStyle={{ paddingBottom: 16 }}
              data={s.items}
              keyExtractor={(item) => item.reviewId}
              ListFooterComponent={list.isFetchingNextPage ? <LoadingMore /> : null}
              refreshControl={refreshControl}
              renderItem={({ item }) => <MyReviewRow item={item} onPress={s.open} />}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              testID="review-inbox-list"
              onEndReached={() => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }}
              onEndReachedThreshold={0.4}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}
