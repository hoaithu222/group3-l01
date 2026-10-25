import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { XpEventDto } from '../api/gamification.types';
import { XP_SOURCE_ART, XP_SOURCE_LABELS } from '../constants/gamification.constants';
import { useXpEvents } from '../queries/gamification.queries';

/** Nguồn lạ (BE thêm loại mới trước app) vẫn có ô icon — ngôi sao trung tính, không để hàng lệch cột. */
const FALLBACK_ART = { icon: 'star', tone: 'neutral' } as const;

function XpEventRow({ event }: { event: XpEventDto }) {
  const label = XP_SOURCE_LABELS[event.sourceType] ?? event.sourceType;
  const art = XP_SOURCE_ART[event.sourceType] ?? FALLBACK_ART;
  const when = formatDateTime(event.occurredAt);
  const sign = event.xp > 0 ? '+' : '';
  const note =
    event.capped || event.blockedReason ? 'Đã chạm giới hạn điểm, không được cộng thêm' : null;
  return (
    <View
      accessibilityLabel={`${label}, ${sign}${event.xp} XP, ${when}${note ? `, ${note}` : ''}`}
      accessible
      className="flex-row items-center gap-sm border-b border-border-1 px-md py-sm"
    >
      {/* Ô icon theo nguồn XP (trang trí — nghĩa đã nằm ở nhãn đọc của cả hàng). */}
      <IconTile name={art.icon} size="sm" tone={art.tone} />
      <View className="flex-1 gap-2xs">
        <Text className="text-body-md text-fg-1" numberOfLines={1}>
          {label}
        </Text>
        <Text className="text-caption-lg text-fg-2">{when}</Text>
        {note ? <Text className="text-caption-lg text-fg-2">{note}</Text> : null}
      </View>
      <Text
        className={
          event.xp > 0 ? 'text-body-lg font-semibold text-success' : 'text-body-lg text-fg-2'
        }
      >
        {sign}
        {event.xp} XP
      </Text>
    </View>
  );
}

/** Lịch sử điểm kinh nghiệm (app.md p4-03 §1, P1) — `GET /me/xp-events` phân trang cursor, mới → cũ. */
export function XpHistoryScreen() {
  const query = useXpEvents();
  // `gamification:updated` chỉ ĐÁNH DẤU CŨ danh sách (không tải ngay) — màn giữ mounted ở tab Tôi tải lại khi quay về.
  useRefetchOnFocus(query);
  const events = query.data?.pages.flatMap((page) => page.data) ?? [];
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });

  return (
    <Screen
      header={<AppBar title="Lịch sử điểm kinh nghiệm" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      {/* Trần 720dp cho máy tính bảng do `Screen` lo (`constrained`) — ⛔ đừng kẹp thêm ở đây, xem `LeaderboardScreen`. */}
      <View className="w-full flex-1">
        {query.isLoading ? (
          // Khung xương CÙNG DÁNG hàng thật (ô icon + hai dòng chữ) — dữ liệu về không làm danh sách nhảy bố cục.
          <View className="gap-sm p-md">
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
          </View>
        ) : query.isError && events.length === 0 ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
            description="Không tải được lịch sử điểm kinh nghiệm."
            icon="alert-warning"
            title="Có lỗi xảy ra"
            tone="danger"
          />
        ) : (
          <FlatList
            contentContainerStyle={{ flexGrow: 1 }}
            data={events}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <EmptyState
                description="Hoàn thành công việc hoặc ôn tập để nhận điểm kinh nghiệm đầu tiên."
                fullscreen
                icon="star"
                title="Chưa có điểm kinh nghiệm"
                tone="accent"
              />
            }
            ListFooterComponent={
              query.hasNextPage ? (
                <View className="p-md">
                  <Button
                    label="Xem thêm"
                    loading={query.isFetchingNextPage}
                    size="sm"
                    variant="secondary"
                    onPress={() => void query.fetchNextPage()}
                  />
                </View>
              ) : null
            }
            refreshControl={refreshControl}
            renderItem={({ item }) => <XpEventRow event={item} />}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Screen>
  );
}
