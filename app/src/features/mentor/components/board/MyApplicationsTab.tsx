import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { useMyApplications } from '../../queries/mentor.queries';
import { mentorErrorMessage } from '../../utils/mentor-errors';
import { mentorPostHref, workspaceHref } from '../../utils/mentor-routes';
import { MyApplicationRow } from '../MyApplicationRow';

/** Tab "Đơn của tôi" (app.md §3): trạng thái bằng chữ; đơn được chấp nhận còn hạn → "Mở nhóm". */
export function MyApplicationsTab() {
  const query = useMyApplications();
  // Nhóm chấp nhận/từ chối đơn không có sự kiện tới máy này — quay lại màn (dữ liệu đã cũ) thì tải lại trạng thái đơn.
  useRefetchOnFocus(query);
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });

  if (query.isLoading) {
    return (
      <View className="gap-sm px-md py-sm">
        <Skeleton className="h-20 rounded-md" />
        <Skeleton className="h-20 rounded-md" />
      </View>
    );
  }
  if (query.isError && rows.length === 0) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
        description={mentorErrorMessage(query.error)}
        icon="alert-warning"
        title="Không tải được đơn của bạn"
        tone="danger"
      />
    );
  }

  return (
    <FlashList
      contentContainerStyle={{ paddingBottom: 24 }}
      data={rows}
      keyExtractor={(a) => a.id}
      ListEmptyComponent={
        <EmptyState
          description="Tìm bài phù hợp ở tab Bài đang mở."
          icon="document"
          title="Bạn chưa ứng tuyển bài nào"
          tone="warning"
        />
      }
      ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <MyApplicationRow
          application={item}
          onOpenPost={(postId) => router.push(mentorPostHref(postId))}
          onOpenWorkspace={(wsId) => router.push(workspaceHref(wsId))}
        />
      )}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
    />
  );
}
