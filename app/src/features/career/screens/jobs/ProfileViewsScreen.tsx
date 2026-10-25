import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { ProfileViewRow } from '../../components/jobs/ProfileViewRow';
import { useJobSettings } from '../../queries/offers.queries';
import { useProfileViews } from '../../queries/profile-views.queries';
import { isOfferGone, recruiterErrorMessage } from '../../utils/recruiter-errors';
import { JOB_SETTINGS_HREF } from '../../utils/recruiter-routes';

const PRIVACY_NOTE =
  'Chỉ hiện doanh nghiệp và số lượt xem theo ngày — bạn không thấy danh tính nhà tuyển dụng.';

/**
 * "Ai đã xem hồ sơ của tôi" (BE `GET /me/profile-views`, mở từ thẻ Tìm việc ở màn Nghề nghiệp): doanh nghiệp nào đã xem hồ sơ
 * Tìm việc của tôi, theo NGÀY, mới nhất trước. Kéo để làm mới, cuộn tải thêm (cursor). Route bọc `FeatureRouteGuard flag="career"`
 * (cờ phân hệ tắt ⇒ "Tính năng chưa bật"); BE còn đòi `recruiter.enabled` nên 404 `CFG_005` ⇒ "Chưa khả dụng", không phải lỗi mạng.
 *
 * Rỗng nói ĐÚNG lý do: đang TẮT Open to work ⇒ doanh nghiệp không tìm thấy hồ sơ nên chưa ai xem (kèm nút mở cài đặt); đã bật mà
 * chưa ai xem ⇒ "Chưa có ai xem". Lượt xem không có socket ⇒ `useRefetchOnFocus` làm mới khi quay lại màn.
 */
export function ProfileViewsScreen() {
  const query = useProfileViews();
  useRefetchOnFocus(query);
  const settings = useJobSettings();
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const header = <AppBar title="Ai đã xem hồ sơ của tôi" onBack={router.back} />;

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-xs">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-16 rounded-md" />
          ))}
        </View>
      </Screen>
    );
  }

  if (!query.data) {
    const gone = isOfferGone(query.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={gone ? undefined : [{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={
            gone ? 'Bảng tin nhà tuyển dụng đang tạm tắt.' : recruiterErrorMessage(query.error)
          }
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Chưa khả dụng' : 'Không tải được lượt xem hồ sơ'}
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  const openToWorkOff = settings.data?.openToWork === false;
  const empty = (
    <EmptyState
      actions={
        openToWorkOff
          ? [{ label: 'Mở Tìm việc', onPress: () => router.push(JOB_SETTINGS_HREF) }]
          : undefined
      }
      description={
        openToWorkOff
          ? 'Bật Tìm việc để doanh nghiệp đã duyệt tìm thấy hồ sơ của bạn.'
          : 'Khi có doanh nghiệp xem hồ sơ của bạn, họ sẽ hiện ở đây.'
      }
      icon="view"
      title="Chưa có ai xem hồ sơ"
      tone="accent"
    />
  );

  return (
    <Screen header={header} padded={false} scrollable={false}>
      <View className="flex-1">
        <FlashList
          contentContainerStyle={{ paddingBottom: 24 }}
          data={items}
          keyExtractor={(view) => `${view.company.id}:${view.dayKey}`}
          ListEmptyComponent={empty}
          ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
          ListHeaderComponent={
            items.length > 0 ? (
              <View className="px-md pb-sm pt-xs">
                <Alert description={PRIVACY_NOTE} tone="info" />
              </View>
            ) : null
          }
          refreshControl={refreshControl}
          renderItem={({ item }) => <ProfileViewRow view={item} />}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
        />
      </View>
    </Screen>
  );
}
