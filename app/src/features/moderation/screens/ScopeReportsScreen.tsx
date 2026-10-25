import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';

import type { QueueScope, ReportStatus, ScopeReportItem } from '../api/moderation.types';
import { ReportReviewSheet } from '../components/ReportReviewSheet';
import { ScopeReportRow } from '../components/ScopeReportRow';
import { QUEUE_EMPTY_TEXT, QUEUE_TABS } from '../constants/moderation.constants';
import { useScopeReports } from '../queries/reports.queries';
import { isQueueForbidden } from '../utils/moderation-errors';

export interface ScopeReportsScreenProps {
  scope: QueueScope;
}

const TAB_ITEMS = QUEUE_TABS.map((tab) => ({ key: tab.key, label: tab.label }));

/**
 * Hàng đợi báo cáo THEO PHẠM VI (p1-08 #9) — `workspaces/[wsId]/reports` (mọi phạm vi tôi kiểm duyệt trong
 * nhóm: OWNER/ADMIN → kênh công khai + người dùng; MANAGER → kênh riêng của mình; OWNER/ADMIN nhóm chat →
 * nhóm của mình) và `messages/[conversationId]/reports` (MỘT nhóm chat). Ba tab khớp `status` của BE.
 *
 * Không realtime (app.md §4): vào màn là tải, kéo để làm mới, xử lý xong tự làm mới. 403/404 = không có (hoặc
 * không thấy) phạm vi kiểm duyệt nào → báo rõ + quay lại, không bắt thử lại.
 */
export function ScopeReportsScreen({ scope }: ScopeReportsScreenProps) {
  const [status, setStatus] = useState<ReportStatus>('OPEN');
  const [selected, setSelected] = useState<ScopeReportItem | null>(null);
  const query = useScopeReports(scope, status);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const forbidden = query.isError && isQueueForbidden(query.error);
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching && !query.isFetchingNextPage,
  });

  return (
    <Screen header={<AppBar title="Báo cáo cần xử lý" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="flex-1 gap-sm py-xs">
        {forbidden ? null : (
          <View className="px-md">
            <Tabs items={TAB_ITEMS} value={status} onChange={(key) => setStatus(key as ReportStatus)} />
          </View>
        )}

        <View className="flex-1">
          {query.isLoading ? (
            // Khung xương ĐÚNG dáng `ScopeReportRow` (ô icon 40 + ba dòng chữ, cùng `px-md py-sm` + kẻ dưới) — dữ liệu về không nhảy bố cục.
            <View accessibilityLabel="Đang tải báo cáo" accessible>
              {Array.from({ length: 4 }, (_, index) => (
                <View key={index} className="flex-row items-start gap-sm border-b border-divider-1 px-md py-sm">
                  <Skeleton className="h-10 w-10" variant="rect" />
                  <View className="flex-1 gap-xs">
                    <Skeleton width="60%" />
                    <Skeleton width="90%" />
                    <Skeleton width="40%" />
                  </View>
                </View>
              ))}
            </View>
          ) : forbidden ? (
            <EmptyState
              actions={[{ label: 'Quay lại', onPress: router.back }]}
              description="Bạn không phải người kiểm duyệt ở đây, hoặc phạm vi này không còn khả dụng."
              icon="lock"
              title="Không có quyền xem"
              tone="warning"
            />
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
              icon={status === 'OPEN' ? 'checkmark-circle' : 'document'}
              title={QUEUE_EMPTY_TEXT[status]}
              tone={status === 'OPEN' ? 'success' : 'neutral'}
            />
          ) : (
            <FlashList<ScopeReportItem>
              contentContainerStyle={{ paddingBottom: 16 }}
              data={items}
              keyExtractor={(item) => item.groupKey}
              refreshControl={refreshControl}
              renderItem={({ item }) => <ScopeReportRow item={item} onPress={setSelected} />}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              onEndReached={() => {
                if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
              }}
              onEndReachedThreshold={0.4}
            />
          )}
        </View>
      </View>

      <ReportReviewSheet item={selected} scope={scope} onClose={() => setSelected(null)} />
    </Screen>
  );
}
