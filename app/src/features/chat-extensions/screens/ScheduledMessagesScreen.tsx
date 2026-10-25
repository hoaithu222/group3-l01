import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { isNetworkError } from '@/shared/utils/errors/to-error-message';

import type { ChatScopeType, ScheduledMessageView, ScheduledTab } from '../api/chat-extensions.types';
import { ScheduledActionSheets, type ScheduledActionTarget } from '../components/schedule/ScheduledActionSheets';
import { ScheduledMessageRow, type ScheduledActionKind } from '../components/schedule/ScheduledMessageRow';
import { useScheduledActions } from '../hooks/useScheduledActions';
import { useScheduledMessages, useScheduledSocket } from '../hooks/useScheduledMessages';
import { describeChatExtError } from '../utils/error-info';

const TABS = [
  { key: 'PENDING', label: 'Đang chờ' },
  { key: 'FAILED', label: 'Lỗi' },
  { key: 'SENT', label: 'Đã gửi' },
];

const EMPTY_COPY: Record<ScheduledTab, { title: string; description: string }> = {
  PENDING: { title: 'Chưa có tin hẹn giờ', description: 'Chạm "+" ở ô soạn tin rồi chọn "Hẹn giờ gửi" để gửi tin vào lúc bạn muốn.' },
  FAILED: { title: 'Không có tin bị lỗi', description: 'Tin hẹn giờ không gửi được sẽ hiện ở đây kèm lý do.' },
  SENT: { title: 'Chưa có tin nào đã gửi', description: 'Tin hẹn giờ đã được gửi đi sẽ hiện ở đây.' },
};

const isTab = (key: string): key is ScheduledTab => key === 'PENDING' || key === 'FAILED' || key === 'SENT';

/** Tham số route là chuỗi tuỳ ý (deep link/tay gõ) — chỉ nhận đúng hai loại phạm vi, còn lại coi như không lọc. */
function scopeFromParams(
  scopeType: string | undefined,
  scopeId: string | undefined,
): { scopeType: ChatScopeType; scopeId: string } | undefined {
  if (!scopeId) return undefined;
  if (scopeType === 'CHANNEL' || scopeType === 'CONVERSATION') return { scopeType, scopeId };
  return undefined;
}

/**
 * "Tin đã hẹn" của tôi (p7-04 app.md §3 `ScheduledMessagesScreen`): ba tab Đang chờ / Lỗi / Đã gửi; mỗi dòng có nơi gửi, trích nội dung, giờ gửi (giờ máy), trạng thái chữ + icon, và hành động theo trạng thái
 * (Sửa giờ · Sửa nội dung · Gửi ngay · Huỷ · Gửi lại). Tham số route: `?scopeType&scopeId` lọc theo MỘT phòng (mở từ banner trên ô soạn), `?id` = dòng cần tô (chạm thông báo "tin hẹn giờ không gửi được"
 * → mở thẳng tab Lỗi). Realtime `scheduled-message:updated` làm mới danh sách; ngoại tuyến hiện cache và ẩn hành động ghi.
 */
export function ScheduledMessagesScreen() {
  const params = useLocalSearchParams<{ id?: string; scopeType?: string; scopeId?: string }>();
  const scope = scopeFromParams(params.scopeType, params.scopeId);
  const [tab, setTab] = useState<ScheduledTab>(params.id ? 'FAILED' : 'PENDING');
  const [target, setTarget] = useState<ScheduledActionTarget | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const query = useScheduledMessages(tab, scope);
  const actions = useScheduledActions();
  const offline = useConnectionState() === 'offline';
  useScheduledSocket();

  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });

  const onAction = (kind: ScheduledActionKind, row: ScheduledMessageView) => {
    if (kind === 'sendNow') {
      actions.sendNow.mutate(row);
      return;
    }
    actions.reschedule.reset();
    actions.resend.reset();
    actions.editContent.reset();
    setTarget((prev) => ({ kind, row, nonce: (prev?.nonce ?? 0) + 1 }));
    setSheetOpen(true);
  };

  let body;
  if (query.isPending) {
    // Khung xương ĐÚNG dáng `ScheduledMessageRow` (ô icon 32 + ba dòng, cùng `px-md py-sm` + kẻ dưới) — dữ liệu về không nhảy bố cục.
    body = (
      <ScreenState
        skeleton={[0, 1, 2, 3].map((i) => (
          <View key={i} className="flex-row items-start gap-sm border-b border-divider-1 px-md py-sm">
            <Skeleton className="h-8 w-8 rounded-xs" variant="rect" />
            <View className="flex-1 gap-xs">
              <Skeleton width="50%" />
              <Skeleton width="85%" />
              <Skeleton width="40%" />
            </View>
          </View>
        ))}
        state="loading"
        title="Đang tải tin đã hẹn"
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
    body = <ScreenState icon="timer" state="empty" {...EMPTY_COPY[tab]} />;
  } else {
    body = (
      <FlashList<ScheduledMessageView>
        data={rows}
        keyExtractor={(row) => row.id}
        ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
        refreshControl={refreshControl}
        renderItem={({ item }) => <ScheduledMessageRow highlighted={item.id === params.id} row={item} onAction={onAction} />}
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
    <Screen header={<AppBar title="Tin đã hẹn" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="flex-1">
        <View className="px-md py-xs">
          <Tabs items={TABS} value={tab} onChange={(key) => isTab(key) && setTab(key)} />
        </View>
        {body}
      </View>
      <ScheduledActionSheets actions={actions} target={target} visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </Screen>
  );
}
