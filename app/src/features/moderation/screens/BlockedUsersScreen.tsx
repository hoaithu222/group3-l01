import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { BlockRequest } from '@/shared/stores/moderation-intent.store';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import type { BlockedUser } from '../api/moderation.types';
import { BlockConfirmSheet } from '../components/BlockConfirmSheet';
import { BlockedUserRow } from '../components/BlockedUserRow';
import { useBlocks } from '../queries/blocks.queries';

/**
 * "Người đã chặn" (app.md p1-08 §3) — mở từ `me/settings`. Danh sách + nút Bỏ chặn (LUÔN qua hộp xác
 * nhận, không bỏ chặn ngay khi bấm). Bỏ chặn xong dòng biến mất tức thì: `useUnblockUser` cập nhật
 * lạc quan tập `useBlockedIds` và làm mới danh sách; các thiết bị khác của bạn cập nhật qua
 * `block:updated`.
 */
export function BlockedUsersScreen() {
  const query = useBlocks();
  const [pending, setPending] = useState<BlockRequest | null>(null);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  // Kéo-để-làm-mới THEO TOKEN — đồng bộ với chặn/bỏ chặn từ thiết bị khác khi socket lỡ một sự kiện.
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });

  function askUnblock(user: BlockedUser): void {
    setPending({ userId: user.userId, name: user.name, mode: 'unblock' });
  }

  return (
    <Screen header={<AppBar title="Người đã chặn" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="flex-1 py-xs">
        {query.isLoading ? (
          // Khung xương ĐÚNG dáng `BlockedUserRow` (avatar 40 · tên · ngày chặn · nút Bỏ chặn) — dữ liệu về không nhảy bố cục.
          <View accessibilityLabel="Đang tải danh sách người đã chặn" accessible>
            {Array.from({ length: 5 }, (_, index) => (
              <View key={index} className="flex-row items-center gap-sm px-md py-sm">
                <Skeleton className="h-10 w-10" variant="circle" />
                <View className="flex-1 gap-xs">
                  <Skeleton width="50%" />
                  <Skeleton width="35%" />
                </View>
                <Skeleton className="h-8 w-20 rounded-full" />
              </View>
            ))}
          </View>
        ) : query.isError && items.length === 0 ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
            description={toErrorMessage(query.error)}
            icon="alert-warning"
            title="Không tải được"
            tone="danger"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="Người bạn chặn sẽ hiện ở đây. Họ không được báo, và bạn có thể bỏ chặn bất cứ lúc nào."
            icon="khoa-tai-khoan-con"
            title="Bạn chưa chặn ai"
            tone="neutral"
          />
        ) : (
          <FlashList<BlockedUser>
            contentContainerStyle={{ paddingBottom: 16 }}
            data={items}
            keyExtractor={(user) => user.userId}
            ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
            refreshControl={refreshControl}
            renderItem={({ item }) => <BlockedUserRow user={item} onUnblock={askUnblock} />}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
          />
        )}
      </View>

      <BlockConfirmSheet request={pending} onClose={() => setPending(null)} />
    </Screen>
  );
}
