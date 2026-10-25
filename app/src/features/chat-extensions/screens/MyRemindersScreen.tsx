import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { isNetworkError } from '@/shared/utils/errors/to-error-message';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';

import type { ReminderTab, ReminderView } from '../api/chat-extensions.types';
import { ReminderRow } from '../components/reminder/ReminderRow';
import { useCancelReminder, useReminders } from '../hooks/useReminders';
import { describeChatExtError } from '../utils/error-info';
import { openReminderMessage } from '../utils/open-reminder';

const TABS = [
  { key: 'PENDING', label: 'Sắp tới' },
  { key: 'FIRED', label: 'Đã nhắc' },
];

const EMPTY_COPY: Record<ReminderTab, { title: string; description: string }> = {
  PENDING: { title: 'Chưa có lời nhắc', description: 'Nhấn giữ một tin rồi chọn "Nhắc lại" để được nhắc vào lúc bạn muốn.' },
  FIRED: { title: 'Chưa có lời nhắc nào đã đến hạn', description: 'Lời nhắc đã báo cho bạn sẽ hiện ở đây.' },
};

const isTab = (key: string): key is ReminderTab => key === 'PENDING' || key === 'FIRED';

/**
 * "Nhắc lại của tôi" (p7-04 app.md §3 `MyRemindersScreen`): hai tab Sắp tới / Đã nhắc; chạm một dòng mở tin; "Xoá" lời nhắc đang chờ. Tin đã gỡ hoặc mất quyền hiện "Tin không còn khả dụng" và
 * KHÔNG trích nội dung. Ngoại tuyến hiện cache và ẩn hành động ghi. Chạm thông báo `message.reminder` với `unavailable=true` cũng dẫn tới đây (`core/notifications`).
 */
export function MyRemindersScreen() {
  const [tab, setTab] = useState<ReminderTab>('PENDING');
  const query = useReminders(tab);
  // Không có socket: nhắc hẹn chuyển "Đang chờ" → "Đã nhắc" ở server theo giờ — quay lại màn (tab Tôi, vẫn mounted) thì tải lại.
  useRefetchOnFocus(query);
  const cancel = useCancelReminder();
  const offline = useConnectionState() === 'offline';
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });

  let body;
  if (query.isPending) {
    // Khung xương ĐÚNG dáng `ReminderRow` (ô icon 40 + hai dòng, cùng `pl-md py-sm` + kẻ dưới) — dữ liệu về không nhảy bố cục.
    body = (
      <ScreenState
        skeleton={[0, 1, 2, 3].map((i) => (
          <View key={i} className="min-h-14 flex-row items-center gap-sm border-b border-divider-1 px-md py-sm">
            <Skeleton className="h-10 w-10" variant="rect" />
            <View className="flex-1 gap-xs">
              <Skeleton width="70%" />
              <Skeleton width="40%" />
            </View>
          </View>
        ))}
        state="loading"
        title="Đang tải lời nhắc"
      />
    );
  } else if (query.isError) {
    body = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
        description={describeChatExtError(query.error).message}
        state={isNetworkError(query.error) || offline ? 'offline' : 'error'}
      />
    );
  } else if (rows.length === 0) {
    body = <ScreenState icon="noti" state="empty" {...EMPTY_COPY[tab]} />;
  } else {
    body = (
      <FlashList<ReminderView>
        data={rows}
        keyExtractor={(reminder) => reminder.id}
        ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <ReminderRow reminder={item} onDelete={(r) => cancel.mutate(r)} onOpen={(r) => void openReminderMessage(r)} />
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

  return (
    <Screen header={<AppBar title="Nhắc lại của tôi" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="flex-1">
        <View className="px-md py-xs">
          <Tabs items={TABS} value={tab} onChange={(key) => isTab(key) && setTab(key)} />
        </View>
        {body}
      </View>
    </Screen>
  );
}
