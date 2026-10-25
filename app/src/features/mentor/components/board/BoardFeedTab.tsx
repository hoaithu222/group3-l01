import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Alert } from '@/shared/ui/alert';
import { ModuleBanner } from '@/shared/ui/banner';
import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { useListRefreshControl } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { Skeleton } from '@/shared/ui/skeleton';

import { useBoardFilter } from '../../hooks/useBoardFilter';
import { useMentorPosts } from '../../queries/mentor.queries';
import { mentorErrorMessage } from '../../utils/mentor-errors';
import { mentorPostHref } from '../../utils/mentor-routes';
import { MentorPostCard } from '../MentorPostCard';
import { SkillFilterChips } from '../SkillFilterChips';

/** Tab "Bài đang mở" (app.md §3 Bảng tin): tìm (server, debounce 300 ms) + lọc kỹ năng + danh sách cursor + đủ trạng thái. */
export function BoardFeedTab() {
  const f = useBoardFilter();
  const query = useMentorPosts(f.filter);
  // Bảng tin không có socket: bài mới/đóng, số cố vấn còn cần do NGƯỜI KHÁC đổi chỉ về khi quay lại màn (nếu đã cũ).
  useRefetchOnFocus(query);
  const offline = useConnectionState() === 'offline';
  const posts = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const suggestions = useMemo(() => [...new Set(posts.flatMap((p) => p.skillLabels))], [posts]);
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });
  const filtered = Boolean(f.filter.q) || f.skills.length > 0;

  const header = (
    <View className="gap-sm pb-sm pt-xs">
      {/* Banner nằm TRONG header của danh sách ⇒ cuộn đi cùng nội dung, không chiếm chỗ cố định của danh sách bài. Icon + tông khớp ô
          "Tìm cố vấn" ở Trang chủ (`support` · `warning`) — người dùng nhận ra đang ở phân hệ nào. */}
      <View className="px-md">
        <ModuleBanner
          description="Chọn bài hợp kỹ năng của bạn và ứng tuyển làm cố vấn cho nhóm."
          icon="support"
          title="Nhóm đang cần cố vấn"
          tone="warning"
        />
      </View>
      <View className="px-md">
        <SearchInput
          defaultValue={f.initialQ}
          placeholder="Tìm bài theo tiêu đề"
          onChangeText={f.setQuery}
          onClear={() => f.setQuery('')}
        />
      </View>
      <SkillFilterChips suggestions={suggestions} value={f.skills} onChange={f.setSkills} />
      {offline ? (
        <View className="px-md">
          <Alert description="Đang offline — hiển thị dữ liệu đã tải." tone="warning" />
        </View>
      ) : null}
      {query.isError && posts.length > 0 ? (
        <View className="px-md">
          <Alert description={mentorErrorMessage(query.error)} tone="error" />
        </View>
      ) : null}
    </View>
  );

  if (query.isLoading) {
    return (
      <View className="gap-sm px-md py-sm">
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-24 rounded-md" />
      </View>
    );
  }

  return (
    <FlashList
      contentContainerStyle={{ paddingBottom: 24 }}
      data={posts}
      keyExtractor={(p) => p.id}
      ListEmptyComponent={
        query.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
            description={mentorErrorMessage(query.error)}
            icon="alert-warning"
            title="Không tải được bảng tin"
            tone="danger"
          />
        ) : filtered ? (
          // Rỗng VÌ LỌC ⇒ "không có kết quả" (kính lúp, tông trung tính) + gỡ lọc; rỗng thật ⇒ hình của phân hệ.
          <EmptyState
            actions={[{ label: 'Xoá bộ lọc', onPress: f.clear }]}
            description="Thử bỏ bớt kỹ năng hoặc từ khoá."
            icon="search"
            title="Chưa có nhóm nào tìm cố vấn phù hợp"
            tone="neutral"
          />
        ) : (
          <EmptyState
            description="Khi có nhóm đăng bài tìm cố vấn, bài sẽ hiện ở đây."
            icon="support"
            title="Chưa có bài tìm cố vấn nào"
            tone="warning"
          />
        )
      }
      ListFooterComponent={query.isFetchingNextPage ? <LoadingMore /> : null}
      ListHeaderComponent={header}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <MentorPostCard post={item} onPress={(p) => router.push(mentorPostHref(p.id))} />
      )}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
    />
  );
}
