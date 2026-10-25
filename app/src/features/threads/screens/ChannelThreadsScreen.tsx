import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { httpStatusOf, isNetworkError } from '@/shared/utils/errors/to-error-message';

import type { ThreadListFilter, ThreadView } from '../api';
import { ThreadListRow } from '../components/ThreadListRow';
import { useThreadAuthors } from '../hooks/useThreadAuthors';
import { useThreadListSync } from '../hooks/useThreadListSync';
import { useChannelThreads, useThreadChannel } from '../queries/threads.queries';

const TABS = [
  { key: 'following', label: 'Đang theo dõi' },
  { key: 'all', label: 'Tất cả' },
];

const isFilter = (key: string): key is ThreadListFilter => key === 'following' || key === 'all';

/**
 * "Danh sách luồng của kênh" (app.md p1-06): hai tab Đang theo dõi (mặc định — cùng mặc định của BE) / Tất cả, mới trả lời nhất trước, cuộn tải thêm (cursor). Chạm một hàng mở màn luồng có sẵn
 * (`ThreadScreen`, route `thread/[messageId]`). Route nằm dưới `[chId]/_layout` nên `room:join` + tự thoát khi mất quyền kênh đã do layout lo — màn này chỉ dựng danh sách.
 *
 * Trạng thái: khung xương đúng dáng hàng · rỗng (theo từng tab, tab "Đang theo dõi" có nút sang "Tất cả") · lỗi mạng ⇒ ngoại tuyến + Thử lại · 403/404 (mất quyền kênh, tính năng tắt) ⇒ "không truy cập được"
 * KHÔNG nút Thử lại · lỗi khác ⇒ Thử lại. Lỗi ở lượt tải THÊM (đã có hàng) không thay cả danh sách bằng màn lỗi mà hiện nút "Tải thêm" ở chân. Realtime: `useThreadListSync` + tải lại khi quay lại màn.
 */
export function ChannelThreadsScreen() {
  const { chId, wsId } = useLocalSearchParams<{ chId: string; wsId: string }>();
  const [filter, setFilter] = useState<ThreadListFilter>('following');
  const query = useChannelThreads(chId, filter);
  const channelQuery = useThreadChannel(chId);
  const resolveAuthor = useThreadAuthors(chId);
  const offline = useConnectionState() === 'offline';
  useRefetchOnFocus(query);
  useThreadListSync(chId);

  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });
  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ params: { chId, wsId }, pathname: '/workspaces/[wsId]/channels/[chId]' });
  const openThread = useCallback(
    (thread: ThreadView) =>
      router.push({
        params: { chId, messageId: thread.parentMessageId, wsId },
        pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
      }),
    [chId, wsId],
  );

  let body;
  if (query.isPending) {
    // Khung xương ĐÚNG dáng `ThreadListRow` (avatar 32 + ba dòng, cùng `px-md py-sm` + kẻ dưới) — dữ liệu về không nhảy bố cục.
    body = (
      <ScreenState
        skeleton={[0, 1, 2, 3].map((i) => (
          <View key={i} className="min-h-16 flex-row items-start gap-sm border-b border-divider-1 px-md py-sm">
            <Skeleton className="h-8 w-8" variant="rect" />
            <View className="flex-1 gap-xs">
              <Skeleton width="30%" />
              <Skeleton width="85%" />
              <Skeleton width="45%" />
            </View>
          </View>
        ))}
        state="loading"
        title="Đang tải danh sách luồng"
      />
    );
  } else if (query.isError && rows.length === 0) {
    const status = httpStatusOf(query.error);
    if (status === 403 || status === 404) {
      // Mất quyền/kênh biến mất/tính năng tắt: thử lại vẫn vậy ⇒ không có nút.
      body = <ScreenState description={toErrorMessage(query.error)} state="forbidden" title="Không xem được luồng của kênh" />;
    } else {
      body = (
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
          description={toErrorMessage(query.error)}
          state={isNetworkError(query.error) || offline ? 'offline' : 'error'}
        />
      );
    }
  } else if (rows.length === 0) {
    body =
      filter === 'following' ? (
        <ScreenState
          action={{ label: 'Xem tất cả luồng', onPress: () => setFilter('all') }}
          description="Luồng bạn đã trả lời hoặc chọn theo dõi sẽ hiện ở đây."
          icon="chat-bubble"
          state="empty"
          title="Bạn chưa theo dõi luồng nào"
        />
      ) : (
        <ScreenState
          description='Nhấn giữ một tin trong kênh rồi chọn "Trả lời trong luồng" để bắt đầu.'
          icon="chat-bubble"
          state="empty"
          title="Kênh chưa có luồng nào"
        />
      );
  } else {
    body = (
      <FlashList<ThreadView>
        data={rows}
        extraData={resolveAuthor}
        keyExtractor={(thread) => thread.id}
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <LoadingMore />
          ) : query.isFetchNextPageError ? (
            <View className="items-center p-md">
              <Button label="Không tải thêm được — Thử lại" size="sm" variant="secondary" onPress={() => void query.fetchNextPage()} />
            </View>
          ) : null
        }
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <ThreadListRow
            resolveAuthor={resolveAuthor}
            showFollowState={filter === 'all'}
            thread={item}
            wsId={wsId}
            onOpen={openThread}
          />
        )}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
      />
    );
  }

  return (
    <Screen
      header={<AppBar subtitle={channelQuery.data?.name} title="Luồng" onBack={goBack} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1">
        <View className="px-md py-xs">
          <Tabs items={TABS} value={filter} onChange={(key) => isFilter(key) && setFilter(key)} />
        </View>
        {body}
      </View>
    </Screen>
  );
}
