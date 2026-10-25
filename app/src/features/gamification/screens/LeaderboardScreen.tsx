import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { LeaderboardEntry, LeaderboardPeriod } from '../api/gamification.types';
import { LeaderboardMeFooter } from '../components/LeaderboardMeFooter';
import { LeaderboardPodium } from '../components/LeaderboardPodium';
import { LeaderboardRow } from '../components/LeaderboardRow';
import { PublicProfileSheet } from '../components/PublicProfileSheet';
import { useGamificationPrivacy } from '../hooks/useGamificationPrivacy';
import { useLeaderboard } from '../queries/gamification.queries';
import { isAccessDenied } from '../utils/level-math';

const PERIOD_TABS = [
  { key: 'WEEK', label: 'Tuần' },
  { key: 'MONTH', label: 'Tháng' },
  { key: 'ALL', label: 'Tất cả' },
];

/**
 * Bảng xếp hạng nhóm (app.md p4-03 §3): kỳ Tuần · Tháng · Tất cả (mỗi kỳ một query key), top 3 nổi bật có HẠNG bằng chữ,
 * danh sách còn lại, dòng "Bạn" ghim đáy (hoặc "Bạn đang ẩn khỏi bảng xếp hạng" + "Hiện lại"). Chạm một dòng ⇒ hồ sơ công
 * khai. Khách/người ngoài nhóm → BE 404 ⇒ "Không truy cập được". Máy tính bảng: `Screen` giới hạn bề rộng cột nội dung, căn giữa.
 */
export function LeaderboardScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const [period, setPeriod] = useState<LeaderboardPeriod>('WEEK');
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const myId = useAuthStore((state) => state.user?.id);
  const privacy = useGamificationPrivacy();
  const query = useLeaderboard(wsId, period);
  const data = query.data;
  const entries = data?.entries ?? [];
  // Mốc 100% của thanh so sánh ở từng hàng = XP của hạng 1 (danh sách server trả đã xếp theo hạng).
  const topXp = entries[0]?.xp ?? 0;
  // Lấp lánh quanh hạng 1 DỪNG khi màn bị che (tab khác, app nền).
  const focused = useIsScreenFocused();
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });

  return (
    <Screen
      footer={
        data ? (
          <LeaderboardMeFooter
            me={data.me}
            pending={privacy.isPending}
            onShow={() => privacy.update({ showInLeaderboard: true })}
          />
        ) : undefined
      }
      header={<AppBar title="Xếp hạng nhóm" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      {/* Trần bề rộng cho máy tính bảng do `Screen` lo (`constrained`, 720dp — `max-w-content`): đừng đặt trần riêng ở đây —
          trùng số thì thừa, lệch số thì hai con số trong một màn chỉ khiến người sau đoán sai trần nào đang có hiệu lực. */}
      <View className="w-full flex-1">
        <View className="px-md py-xs">
          <Tabs
            items={PERIOD_TABS}
            value={period}
            onChange={(key) => {
              hapticSelection();
              setPeriod(key as LeaderboardPeriod);
            }}
          />
        </View>
        {query.isLoading ? (
          <View className="gap-sm p-md">
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
          </View>
        ) : query.isError ? (
          isAccessDenied(query.error) ? (
            <EmptyState
              actions={[{ label: 'Quay lại', onPress: router.back }]}
              description="Bạn không có quyền xem bảng xếp hạng của nhóm này."
              icon="lock"
              title="Không truy cập được"
              tone="warning"
            />
          ) : (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
              description="Không tải được bảng xếp hạng."
              icon="alert-warning"
              title="Có lỗi xảy ra"
              tone="danger"
            />
          )
        ) : (
          <FlatList
            contentContainerStyle={{ flexGrow: 1 }}
            data={entries.slice(3)}
            keyExtractor={(item) => item.userId}
            ListEmptyComponent={
              entries.length === 0 ? (
                <EmptyState
                  description="Chưa ai có XP trong kỳ này."
                  fullscreen
                  icon="star"
                  title="Bảng trống"
                  tone="accent"
                />
              ) : null
            }
            ListHeaderComponent={
              <LeaderboardPodium active={focused} entries={entries} onPress={setSelected} />
            }
            refreshControl={refreshControl}
            renderItem={({ item }) => (
              <LeaderboardRow
                entry={item}
                isMe={item.userId === myId}
                topXp={topXp}
                onPress={setSelected}
              />
            )}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
      <PublicProfileSheet
        name={selected?.name}
        userId={selected?.userId ?? null}
        onClose={() => setSelected(null)}
      />
    </Screen>
  );
}
