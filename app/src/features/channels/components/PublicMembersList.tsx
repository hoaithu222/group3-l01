import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { ChannelMemberRow as ChannelMemberRowData } from '../api';
import { useChannelMembers } from '../queries/channel-members.queries';
import { ChannelMemberRow } from './ChannelMemberRow';

export interface PublicMembersListProps {
  chId: string;
}

/**
 * Kênh PUBLIC: danh sách người đã tham gia, kèm hiện diện (app.md §3).
 *
 * ⚠️ Tự dựng `<Screen>` RIÊNG với `scrollable={false}`: `FlashList` tự cuộn,
 * lồng nó vào `ScrollView` của `Screen` mặc định là lồng hai vùng cuộn cùng
 * chiều (cùng cảnh báo mà `SelectSheet.tsx` đã ghi). `PrivateGrantsList`
 * (không ảo hoá) thì ngược lại, cần `Screen` cuộn — nên KHÔNG dùng chung một
 * `Screen` ở màn cha.
 */
export function PublicMembersList({ chId }: PublicMembersListProps) {
  const { data, error, fetchNextPage, hasNextPage, isError, isFetchingNextPage, isLoading, isRefetching, refetch } =
    useChannelMembers(chId, '');
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void refetch(),
    refreshing: isRefetching,
  });

  return (
    <Screen header={<AppBar title="Thành viên" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="flex-1">
        {isLoading ? (
          // Cùng hình `ChannelMemberRow` (avatar 40 + tên + chấm hiện diện), cùng lề `px-md py-sm`.
          <View className="py-xs">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonParagraphWithIcon key={index} className="px-md py-sm" />
            ))}
          </View>
        ) : isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            title="Không tải được"
            tone="danger"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="Chỉ có bạn trong kênh này."
            icon="user"
            title="Chỉ có bạn"
            tone="info"
          />
        ) : (
          <FlashList<ChannelMemberRowData>
            contentContainerStyle={{ paddingBottom: 16 }}
            data={items}
            keyExtractor={(item) => item.userId}
            refreshControl={refreshControl}
            renderItem={({ item }) => <ChannelMemberRow member={item} />}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
          />
        )}
      </View>
    </Screen>
  );
}
