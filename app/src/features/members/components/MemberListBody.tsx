import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import type { useListRefreshControl } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { MemberListItem } from '../hooks/useMemberListItems';

export interface MemberListBodyProps {
  /** Trạng thái rỗng đúng ca (`MemberListEmpty`) — màn cha dựng vì nó giữ bộ lọc. */
  empty: ReactNode;
  error: unknown;
  /** Khối đầu danh sách (lối vào "Yêu cầu tham gia") — cuộn đi theo danh sách, và vẫn hiện ở lúc tải/rỗng. */
  header: ReactElement;
  isError: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  items: MemberListItem[];
  onEndReached: () => void;
  onRetry: () => void;
  refreshControl: ReturnType<typeof useListRefreshControl>;
  renderItem: ListRenderItem<MemberListItem>;
}

/**
 * Vùng danh sách của `MemberListScreen` (tải · lỗi · rỗng · `FlashList`) — tách ra để màn dưới trần 200 dòng.
 *
 * `getItemType` tách hai loại ô (tiêu đề nhóm / hàng người): FlashList chỉ tái dùng ô CÙNG loại, không đổ một hàng người vào khung
 * của tiêu đề rồi đo lại. `keyboardDismissMode="on-drag"`: cuộn danh sách là cất bàn phím của ô tìm (kiểu Slack/Discord).
 */
export function MemberListBody({
  empty,
  error,
  header,
  isError,
  isFetchingNextPage,
  isLoading,
  items,
  onEndReached,
  onRetry,
  refreshControl,
  renderItem,
}: MemberListBodyProps) {
  if (isLoading) {
    // Khung xương CÙNG HÌNH hàng thật (avatar tròn 40 + hai dòng chữ), cùng lề `px-md py-sm` của `MemberRow`.
    return (
      <View>
        {header}
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonParagraphWithIcon key={index} className="px-md py-sm" />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRetry }]}
        description={toErrorMessage(error)}
        icon="alert-warning"
        title="Không tải được danh sách"
        tone="danger"
      />
    );
  }

  if (items.length === 0) {
    return (
      <View className="flex-1">
        {header}
        {empty}
      </View>
    );
  }

  return (
    <FlashList<MemberListItem>
      contentContainerStyle={{ paddingBottom: 16 }}
      data={items}
      getItemType={(item) => item.kind}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.key}
      ListFooterComponent={isFetchingNextPage ? <LoadingMore className="py-md" /> : null}
      ListHeaderComponent={header}
      refreshControl={refreshControl}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
    />
  );
}
