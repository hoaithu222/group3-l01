import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { AcceptMentorSheet } from '../components/AcceptMentorSheet';
import { ApplicationCard } from '../components/ApplicationCard';
import { useApplicationReview } from '../hooks/useApplicationReview';
import { useMentorPost, usePostApplications } from '../queries/mentor.queries';
import { mentorErrorMessage } from '../utils/mentor-errors';

/** Khe giữa hai thẻ đơn — khai ở cấp module (không tạo component mới mỗi lần vẽ). */
function Separator() {
  return <View className="h-sm" />;
}

/**
 * Duyệt đơn của một bài (app.md §3): hồ sơ tóm tắt từng người, Chấp nhận → `AcceptMentorSheet`, Từ chối. Bài đã đủ cố vấn/đóng
 * → nút Chấp nhận khoá + giải thích (đơn chờ vẫn giữ để xem, README §5 accept bước 6). 409 `MENTOR_005` → toast + tải lại.
 */
export function ApplicationReviewScreen() {
  const { postId = '', wsId = '' } = useLocalSearchParams<{ postId: string; wsId: string }>();
  const post = useMentorPost(postId);
  const list = usePostApplications(postId, undefined);
  const review = useApplicationReview(wsId, postId);
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const refreshControl = useListRefreshControl({
    onRefresh: () => void list.refetch(),
    refreshing: list.isRefetching,
  });
  const accepting = post.data?.status === 'OPEN' && !post.data.hidden;
  const header = <AppBar subtitle={post.data?.title} title="Đơn ứng tuyển" onBack={router.back} />;

  if (list.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-md">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen header={header} padded={false} scrollable={false}>
      <FlashList
        contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 16 }}
        data={rows}
        ItemSeparatorComponent={Separator}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={
          list.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void list.refetch() }]}
              description={mentorErrorMessage(list.error)}
              icon="alert-warning"
              title="Không tải được đơn"
              tone="danger"
            />
          ) : (
            <EmptyState
              description="Khi có người ứng tuyển, đơn sẽ hiện ở đây."
              icon="document"
              title="Chưa có đơn"
              tone="warning"
            />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <LoadingMore /> : null}
        ListHeaderComponent={
          post.data && !accepting ? (
            <View className="py-sm">
              <Alert
                description="Bài đã đủ cố vấn hoặc đã đóng — không chấp nhận thêm được. Đơn đang chờ vẫn được giữ."
                tone="info"
              />
            </View>
          ) : (
            <View className="h-sm" />
          )
        }
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <ApplicationCard
            acceptDisabled={!accepting}
            application={item}
            busy={review.acceptBusy || review.rejectBusy}
            onAccept={review.open}
            onReject={review.reject}
          />
        )}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
      />
      {review.target && post.data ? (
        <AcceptMentorSheet
          applicantName={review.target.applicant.name}
          busy={review.acceptBusy}
          errorMessage={review.acceptError}
          invalidChannelIds={review.invalidChannelIds}
          postVersion={post.data.version}
          visible
          wsId={wsId}
          onClose={review.close}
          onSubmit={review.submit}
        />
      ) : null}
    </Screen>
  );
}
