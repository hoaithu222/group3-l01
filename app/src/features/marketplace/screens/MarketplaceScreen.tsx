import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { useSearchInput } from '@/shared/ui/search';
import { isNetworkError } from '@/shared/utils/errors';

import type { Listing, ListingContentType, ListingSort } from '../api/marketplace.types';
import { MarketplaceGridRow } from '../components/MarketplaceGridRow';
import { MarketplaceGridSkeleton } from '../components/MarketplaceGridSkeleton';
import { MarketplaceListHeader } from '../components/MarketplaceListHeader';
import { MARKETPLACE_GRID_COLUMNS, MARKETPLACE_TONE } from '../constants/marketplace.constants';
import { useListings } from '../queries/listings.queries';
import { chunkRows } from '../utils/grid-rows';
import { marketplaceErrorCode } from '../utils/marketplace-errors';
import { listingDetailHref, MARKETPLACE_MINE_HREF, MARKETPLACE_NEW_HREF } from '../utils/marketplace-routes';

/**
 * Chợ tài liệu (app.md p7-02 §1/§3 P1): tìm (IME-safe qua `useSearchInput`), lọc loại, sắp xếp, LƯỚI hai cột `MarketplaceItemCard`, cuộn tải
 * thêm. Dải đầu màn mang nhãn "Nội dung do người dùng tạo" (app.md §7) — nhắc đây không phải nội dung do nền tảng thẩm định biên tập.
 * `COIN_008` (chợ chưa mở) hiện thông điệp riêng thay vì "Thử lại" — thử lại không giải quyết được gì khi admin chưa bật chợ.
 *
 * Lưới: `FlatList` ảo hoá theo HÀNG (mỗi phần tử là một hàng hai ô, `chunkRows`) — xem lý do không dùng `numColumns` ở `grid-rows.ts`.
 * Rỗng tách hai ca: đang tìm/lọc mà không khớp (tông trung tính, gợi ý đổi từ khoá) ≠ chợ chưa có tin nào (mời niêm yết tin đầu tiên).
 */
export function MarketplaceScreen() {
  const [contentType, setContentType] = useState('ALL');
  const [sort, setSort] = useState<ListingSort>('new');
  const search = useSearchInput();
  const filterType = contentType === 'ALL' ? undefined : (contentType as ListingContentType);

  const listings = useListings({ q: search.value || undefined, contentType: filterType, sort });
  const rows = useMemo(
    () => chunkRows(listings.data?.pages.flatMap((page) => page.data) ?? [], MARKETPLACE_GRID_COLUMNS),
    [listings.data],
  );

  const refreshControl = useListRefreshControl({
    onRefresh: () => void listings.refetch(),
    refreshing: listings.isRefetching && !listings.isFetchingNextPage,
  });

  const openDetail = (listing: Listing) => router.push(listingDetailHref(listing.id));
  const loadMore = () => {
    if (listings.hasNextPage && !listings.isFetchingNextPage) void listings.fetchNextPage();
  };

  let empty: ReactNode;
  if (listings.isLoading) {
    empty = <ScreenState fullscreen={false} skeleton={<MarketplaceGridSkeleton />} state="loading" />;
  } else if (listings.isError && marketplaceErrorCode(listings.error) === 'COIN_008') {
    empty = (
      <EmptyState
        description="Quản trị viên chưa mở chợ tài liệu. Bạn quay lại sau nhé."
        icon="store"
        title="Chợ chưa mở"
        tone="warning"
      />
    );
  } else if (listings.isError) {
    empty = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void listings.refetch() }}
        fullscreen={false}
        state={isNetworkError(listings.error) ? 'offline' : 'error'}
        title="Không tải được chợ tài liệu"
      />
    );
  } else if (search.value || filterType) {
    empty = (
      <EmptyState
        description="Thử từ khoá khác, hoặc chọn “Tất cả” để xem mọi loại nội dung."
        icon="search"
        size="compact"
        title="Không tìm thấy tài liệu phù hợp"
        tone="neutral"
      />
    );
  } else {
    empty = (
      <EmptyState
        actions={[{ label: 'Niêm yết tài liệu', onPress: () => router.push(MARKETPLACE_NEW_HREF) }]}
        description="Hãy là người đầu tiên niêm yết bộ học hoặc tài liệu của bạn."
        icon="fn/mua-sam"
        title="Chưa có tài liệu nào được niêm yết"
        tone={MARKETPLACE_TONE}
      />
    );
  }

  return (
    <Screen
      header={
        <AppBar
          actions={
            <View className="flex-row gap-xs">
              <Button accessibilityLabel="Tin của tôi" iconLeft="document" iconOnly size="sm" variant="tertiary" onPress={() => router.push(MARKETPLACE_MINE_HREF)} />
              <Button accessibilityLabel="Niêm yết" iconLeft="add" iconOnly size="sm" variant="tertiary" onPress={() => router.push(MARKETPLACE_NEW_HREF)} />
            </View>
          }
          title="Chợ tài liệu"
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <FlatList
        contentContainerClassName="gap-sm p-md"
        data={rows}
        keyExtractor={(row) => row.map((listing) => listing.id).join('|')}
        ListEmptyComponent={empty}
        ListFooterComponent={
          listings.isFetchingNextPage ? (
            <LoadingMore />
          ) : listings.isFetchNextPageError ? (
            // Trang sau lỗi (mất sóng giữa chừng): nói rõ và cho tải lại tại chỗ — cuộn tiếp không tự gọi lại khi đã chạm đáy.
            <Button label="Tải thêm" size="sm" variant="secondary" onPress={loadMore} />
          ) : null
        }
        ListHeaderComponent={
          <MarketplaceListHeader
            contentType={contentType}
            searchProps={search.inputProps}
            sort={sort}
            onContentTypeChange={setContentType}
            onSortChange={setSort}
          />
        }
        refreshControl={refreshControl}
        renderItem={({ item }) => <MarketplaceGridRow listings={item} onOpen={openDetail} />}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
      />
    </Screen>
  );
}
