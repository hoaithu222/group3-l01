import { FlashList } from '@shopify/flash-list';
import { router, useGlobalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { ActionMenu } from '@/shared/ui/action-menu';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { OfferFilterChips } from '../../components/jobs/OfferFilterChips';
import { OfferRow } from '../../components/jobs/OfferRow';
import { useOfferEvents } from '../../hooks/useOfferEvents';
import { useOfferInbox } from '../../hooks/useOfferInbox';
import { useJobSettings } from '../../queries/offers.queries';
import type { OfferGroup } from '../../utils/offer-format';
import { isOfferGone, recruiterErrorMessage } from '../../utils/recruiter-errors';
import { BLOCKED_COMPANIES_HREF, JOB_SETTINGS_HREF, offerHref } from '../../utils/recruiter-routes';

/**
 * Hộp thư lời mời (app.md §3): chip lọc Tất cả · Mới · Quan tâm · Đã đóng, `OfferRow`, kéo để làm mới, cuộn tải thêm. Rỗng nói ĐÚNG lý do: đang tắt Open to work
 * ⇒ "Bật Tìm việc để doanh nghiệp tìm thấy bạn" (kèm nút mở cài đặt); đã bật mà chưa ai mời ⇒ "Chưa có lời mời nào". Socket `offer:updated` vá dòng tại chỗ.
 * Offline: đọc cache (React Query giữ dữ liệu cũ khi tải lại lỗi) — `ConnectionBanner` toàn cục đã báo mất mạng.
 * Máy tính bảng (app.md §7): màn này nằm ở cột TRÁI của `OffersSplitLayout`; chạm dòng thì THAY route ở khung phải (`replace`, không chồng ngăn xếp) và dòng đang mở tô nền.
 */
export function OfferInboxScreen() {
  useOfferEvents();
  const { isTablet } = useBreakpoint();
  // Màn này nằm NGOÀI ngăn xếp `offers` (cột trái của bố cục hai cột) nên `useLocalSearchParams` không thấy `offerId` — phải đọc toàn cục.
  const activeId = useGlobalSearchParams<{ offerId?: string }>().offerId;
  const [group, setGroup] = useState<OfferGroup>('all');
  const inbox = useOfferInbox(group);
  const settings = useJobSettings();
  const refreshControl = useListRefreshControl({
    onRefresh: inbox.refetch,
    refreshing: inbox.isRefetching,
  });

  const header = (
    <AppBar
      actions={
        <ActionMenu
          accessibilityLabel="Thêm tuỳ chọn hộp thư lời mời"
          items={[
            {
              icon: 'setting',
              key: 'settings',
              label: 'Cài đặt Tìm việc',
              onPress: () => router.push(JOB_SETTINGS_HREF),
            },
            {
              icon: 'shield-user',
              key: 'blocked',
              label: 'Doanh nghiệp đã chặn',
              onPress: () => router.push(BLOCKED_COMPANIES_HREF),
            },
          ]}
        />
      }
      title="Lời mời"
      onBack={router.back}
    />
  );

  if (inbox.isLoading) {
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

  if (inbox.isError && inbox.all.length === 0) {
    const gone = isOfferGone(inbox.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={gone ? undefined : [{ label: 'Thử lại', onPress: inbox.refetch }]}
          description={
            gone ? 'Bảng tin nhà tuyển dụng đang tạm tắt.' : recruiterErrorMessage(inbox.error)
          }
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Chưa khả dụng' : 'Không tải được lời mời'}
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  const openToWorkOff = settings.data?.openToWork === false;
  const empty =
    group === 'all' ? (
      <EmptyState
        actions={
          openToWorkOff
            ? [{ label: 'Mở Tìm việc', onPress: () => router.push(JOB_SETTINGS_HREF) }]
            : undefined
        }
        description={
          openToWorkOff
            ? 'Bật Tìm việc để doanh nghiệp tìm thấy bạn'
            : 'Lời mời từ doanh nghiệp sẽ hiện ở đây.'
        }
        icon="email"
        title={openToWorkOff ? 'Chưa có lời mời' : 'Chưa có lời mời nào'}
        tone="accent"
      />
    ) : (
      <EmptyState
        description="Thử chọn mục khác ở trên."
        icon="email"
        title="Không có lời mời trong mục này"
        tone="neutral"
      />
    );

  return (
    <Screen header={header} padded={false} scrollable={false}>
      <OfferFilterChips value={group} onChange={setGroup} />
      <View className="flex-1">
        <FlashList
          contentContainerStyle={{ paddingBottom: 24 }}
          data={inbox.items}
          extraData={activeId}
          keyExtractor={(offer) => offer.id}
          ListEmptyComponent={inbox.isFetchingMore ? null : empty}
          ListFooterComponent={inbox.isFetchingMore ? <LoadingMore /> : null}
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <OfferRow
              offer={item}
              selected={isTablet && item.id === activeId}
              onPress={(id) =>
                isTablet ? router.replace(offerHref(id)) : router.push(offerHref(id))
              }
            />
          )}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onEndReached={inbox.loadMore}
        />
      </View>
    </Screen>
  );
}
