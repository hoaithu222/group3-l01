import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { ModuleBanner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { PomodoroHistoryItem } from '../api/pomodoro.types';
import { usePomodoroHistory } from '../queries/pomodoro.queries';
import { formatSpan } from '../utils/clock';

function summaryOf(item: PomodoroHistoryItem): string {
  const parts = [
    `Có mặt ${formatSpan(item.presentSeconds)}`,
    `${item.cyclesAttended} vòng tập trung`,
  ];
  if (item.interruptions > 0) parts.push(`${item.interruptions} lần gián đoạn`);
  return parts.join(' · ');
}

/**
 * Lịch sử học của tôi (app.md p5-02 §1, P1 — `GET /me/pomodoro/history`, cursor, mới → cũ): mỗi lượt là một phiên tôi từng vào — thời gian có mặt, số vòng,
 * gián đoạn, mục tiêu. ⚠️ Nhật ký CÁ NHÂN, không dùng để chấm điểm (nói rõ ở dải đầu danh sách). Chạm một lượt mở lại kênh của nó. Lỗi làm mới KHÔNG được
 * xoá danh sách đã tải.
 *
 * Giao diện: dải `ModuleBanner` (đồng hồ `timer`, tông `brand` — cùng ô icon với thẻ "giờ tập trung" ở Trang chủ) mang câu "không chấm điểm"; mỗi thẻ có
 * icon nhỏ trước dòng số liệu và mục tiêu (trang trí, nghĩa nằm ở chữ). Lỗi mạng nói rõ là lỗi KẾT NỐI (`ScreenState offline`).
 */
export function PomodoroHistoryScreen() {
  const history = usePomodoroHistory();
  // Màn giữ mounted ở tab Tôi — phiên học ở máy khác (không có sự kiện tới máy này) thì quay lại mới thấy.
  useRefetchOnFocus(history);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen
      header={<AppBar title="Lịch sử học của tôi" onBack={router.back} />}
      refreshing={history.isRefetching}
      onRefresh={() => void history.refetch()}
    >
      {history.isLoading ? (
        // Khung xương cùng dáng danh sách thẻ thật (dải đầu + thẻ phiên), không phải một khối liền.
        <View className="gap-sm py-md">
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-28 rounded-md" />
          <Skeleton className="h-28 rounded-md" />
        </View>
      ) : history.isError && items.length === 0 ? (
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void history.refetch() }}
          state={isNetworkError(history.error) ? 'offline' : 'error'}
          title="Không tải được lịch sử"
        />
      ) : items.length === 0 ? (
        <EmptyState
          description="Vào một phòng Pomodoro để bắt đầu ghi lại thời gian học của bạn."
          icon="timer"
          title="Chưa có phiên nào"
        />
      ) : (
        <View className="gap-sm py-md">
          <Reveal>
            <ModuleBanner
              className="mb-xs"
              description="Nhật ký cá nhân, không dùng để chấm điểm."
              icon="timer"
              title="Thời gian tập trung của bạn"
            />
          </Reveal>
          {items.map((item) => (
            <Card
              key={item.sessionId}
              title={item.channelName ?? 'Phòng Pomodoro'}
              onPress={() =>
                router.push({
                  params: { chId: item.channelId, wsId: item.workspaceId },
                  pathname: '/workspaces/[wsId]/channels/[chId]',
                })
              }
            >
              <Text className="text-caption-sm text-fg-2">{formatDateTime(item.joinedAt)}</Text>
              <View className="flex-row items-center gap-xs">
                <Icon color="fg-brand" name="timer" size="sm" />
                <Text className="flex-1 text-body-md text-fg-1">{summaryOf(item)}</Text>
              </View>
              {item.goal ? (
                <View className="flex-row items-center gap-xs">
                  <Icon color="action-accent" name="star" size="sm" />
                  <Text className="flex-1 text-caption-lg text-fg-2">{`Mục tiêu: ${item.goal}`}</Text>
                </View>
              ) : null}
            </Card>
          ))}
          {history.hasNextPage ? (
            <Button
              label="Tải thêm"
              loading={history.isFetchingNextPage}
              variant="tertiary"
              onPress={() => void history.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
