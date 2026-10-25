import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import type { MockAttemptSummaryDto } from '../api/mock-attempts.types';
import { HistoryRow } from '../components/mock/HistoryRow';
import { HistoryTrend } from '../components/mock/HistoryTrend';
import { useMockHistory } from '../queries/mock-attempts.queries';
import { studyErrorMessage } from '../utils/error-info';
import { historyStats } from '../utils/mock-history-stats';
import { scoreDeltas } from '../utils/mock-history-utils';
import { mockAttemptHref, mockResultHref } from '../utils/study-routes';

const TITLE = 'Lịch sử thi';

/**
 * Lịch sử thi thử (app.md p4-02 §1, P1): mọi bộ (`GET /me/mock-attempts`) hoặc một bộ (`?setId=`), cursor 20, mới → cũ.
 * Lượt dở mở lại màn thi, lượt đã kết thúc mở kết quả. Đầu danh sách là thống kê + xu hướng điểm (`HistoryTrend`, chỉ tính từ
 * phần đã tải). Đủ trạng thái: tải, lỗi + thử lại, rỗng, offline (giữ cache).
 */
export function MockHistoryScreen() {
  const { setId } = useLocalSearchParams<{ setId?: string }>();
  const query = useMockHistory(setId || undefined);
  const offline = useConnectionState() === 'offline';
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const deltas = useMemo(() => scoreDeltas(rows), [rows]);
  const stats = useMemo(() => historyStats(rows), [rows]);
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });
  const header = <AppBar title={TITLE} onBack={() => router.back()} />;

  // ⛔ `if/else` chứ không `cond ? hrefA : hrefB`: `Href` đã vài trăm mục nên biểu thức điều kiện làm TS rút gọn union quá giới hạn (TS2590).
  const open = (attempt: MockAttemptSummaryDto) => {
    if (attempt.status === 'IN_PROGRESS') router.push(mockAttemptHref(attempt.id));
    else router.push(mockResultHref(attempt.id));
  };

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-sm">
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
        </View>
      </Screen>
    );
  }
  if (query.isError && rows.length === 0) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={studyErrorMessage(query.error)}
          icon="alert-warning"
          title="Không tải được lịch sử thi"
          tone="danger"
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} padded={false} scrollable={false}>
      {offline ? (
        <View className="px-md pb-xs">
          <Alert description="Đang offline — hiển thị dữ liệu đã tải." tone="warning" />
        </View>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          description="Làm một bài thi thử từ bộ học để xem kết quả tại đây."
          icon="history"
          title="Chưa có lượt thi nào"
          tone="info"
        />
      ) : (
        <FlashList
          contentContainerStyle={{ paddingBottom: 24 }}
          data={rows}
          keyExtractor={(row) => row.id}
          ListFooterComponent={
            query.hasNextPage ? (
              <View className="px-md py-sm">
                <Button
                  fullWidth
                  label="Tải thêm"
                  loading={query.isFetchingNextPage}
                  variant="secondary"
                  onPress={() => void query.fetchNextPage()}
                />
              </View>
            ) : null
          }
          ListHeaderComponent={stats ? <HistoryTrend stats={stats} /> : null}
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <HistoryRow attempt={item} delta={deltas[item.id]} onPress={open} />
          )}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
