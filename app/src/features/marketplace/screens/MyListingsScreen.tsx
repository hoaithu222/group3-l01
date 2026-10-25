import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { isNetworkError } from '@/shared/utils/errors';
import { formatDate } from '@/shared/utils/format/date.utils';
import { hapticSelection } from '@/shared/utils/haptics';

import { CONTENT_TYPE_VISUAL, MARKETPLACE_TONE } from '../constants/marketplace.constants';
import { useMyListings, useMyPurchases } from '../queries/my.queries';
import { CONTENT_TYPE_LABELS, LISTING_STATUS_BADGE_VARIANT, LISTING_STATUS_LABELS, formatCoins } from '../utils/listing-format';
import { listingDetailHref, MARKETPLACE_NEW_HREF } from '../utils/marketplace-routes';

type Tab = 'listings' | 'purchases';

const TABS = [
  { key: 'listings', label: 'Tin của tôi' },
  { key: 'purchases', label: 'Đã mua' },
];

/** Khung xương CAO BẰNG hàng thật (ô icon 32 + hai dòng chữ, `py-xs`) — danh sách không nhảy lúc dữ liệu về. */
const ROW_SKELETON = (
  <View className="gap-sm p-md">
    {[0, 1, 2, 3].map((row) => (
      <Skeleton key={row} className="h-14 rounded-md" />
    ))}
  </View>
);

/**
 * "Tin của tôi / Đã mua" (app.md §3): trạng thái chữ (Chờ duyệt/Đang bán/Đã ẩn/Đã gỡ) + lý do ẩn cho tin; ngày mua + trạng thái hoàn cho
 * lịch sử mua. Mỗi hàng mở đầu bằng ô icon theo LOẠI nội dung (cùng bảng `CONTENT_TYPE_VISUAL` với lưới chợ). Cuộn tới cuối tự tải thêm.
 * `padded={false}`: danh sách tự có lề (`p-md`), hàng tab bọc `px-md` riêng — không lề đúp 32dp.
 */
export function MyListingsScreen() {
  const [tab, setTab] = useState<Tab>('listings');
  const listings = useMyListings();
  const purchases = useMyPurchases();

  const listingRows = useMemo(() => listings.data?.pages.flatMap((page) => page.data) ?? [], [listings.data]);
  const purchaseRows = useMemo(() => purchases.data?.pages.flatMap((page) => page.data) ?? [], [purchases.data]);

  const active = tab === 'listings' ? listings : purchases;
  const refreshControl = useListRefreshControl({
    onRefresh: () => void active.refetch(),
    refreshing: active.isRefetching && !active.isFetchingNextPage,
  });
  const loadMore = () => {
    if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
  };
  const footer = active.isFetchingNextPage ? <LoadingMore /> : null;

  let body: ReactNode;
  if (active.isLoading) {
    body = <ScreenState fullscreen={false} skeleton={ROW_SKELETON} state="loading" />;
  } else if (active.isError) {
    body = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void active.refetch() }}
        fullscreen={false}
        state={isNetworkError(active.error) ? 'offline' : 'error'}
        title={tab === 'listings' ? 'Không tải được tin niêm yết' : 'Không tải được lịch sử mua'}
      />
    );
  } else if (tab === 'listings') {
    body = (
      <FlatList
        contentContainerClassName="p-md"
        data={listingRows}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            actions={[{ label: 'Niêm yết tài liệu', onPress: () => router.push(MARKETPLACE_NEW_HREF) }]}
            description="Niêm yết bộ học công khai của bạn để bắt đầu."
            icon="store"
            title="Bạn chưa niêm yết tin nào"
            tone={MARKETPLACE_TONE}
          />
        }
        ListFooterComponent={footer}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <ListItem
            className="py-xs"
            description={`${CONTENT_TYPE_LABELS[item.contentType]}${item.status === 'HIDDEN' && item.hiddenReason ? ` · ${item.hiddenReason}` : ''}`}
            divider
            emphasis="title"
            label={item.title}
            leading={<IconTile name={CONTENT_TYPE_VISUAL[item.contentType].icon} size="sm" tone={CONTENT_TYPE_VISUAL[item.contentType].tone} />}
            trailing={<Badge label={LISTING_STATUS_LABELS[item.status]} size="sm" variant={LISTING_STATUS_BADGE_VARIANT[item.status]} />}
            value={formatCoins(item.price)}
            onPress={() => router.push(listingDetailHref(item.id))}
          />
        )}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
      />
    );
  } else {
    body = (
      <FlatList
        contentContainerClassName="p-md"
        data={purchaseRows}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            description="Tài liệu bạn mua từ chợ sẽ hiện ở đây."
            icon="basket-01"
            title="Bạn chưa mua tài liệu nào"
            tone={MARKETPLACE_TONE}
          />
        }
        ListFooterComponent={footer}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <ListItem
            className="py-xs"
            description={
              item.refundedAt
                ? 'Đã hoàn xu — tin niêm yết đã bị gỡ'
                : `${CONTENT_TYPE_LABELS[item.listingContentType]} · Mua ngày ${formatDate(item.createdAt)}`
            }
            divider
            emphasis="title"
            label={item.listingTitle}
            leading={<IconTile name={CONTENT_TYPE_VISUAL[item.listingContentType].icon} size="sm" tone={CONTENT_TYPE_VISUAL[item.listingContentType].tone} />}
            trailing={item.refundedAt ? <Badge label="Đã hoàn xu" size="sm" variant="info" /> : undefined}
            value={formatCoins(item.price)}
            onPress={() => router.push(listingDetailHref(item.listingId))}
          />
        )}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
      />
    );
  }

  return (
    <Screen header={<AppBar title="Tin của tôi" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="px-md pt-xs">
        <Tabs
          items={TABS}
          value={tab}
          variant="pill"
          onChange={(key) => {
            if (key !== tab) hapticSelection();
            setTab(key as Tab);
          }}
        />
      </View>
      <View className="flex-1">{body}</View>
    </Screen>
  );
}
