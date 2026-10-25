import { FlashList } from '@shopify/flash-list';
import { useMemo, type ReactElement } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { SPACING } from '@/shared/theme';
import type { BannerTone } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { EmptyState, type EmptyStateProps } from '@/shared/ui/empty-state';
import type { IconName } from '@/shared/ui/icon';
import { useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { isNetworkError } from '@/shared/utils/errors';
import { tCommon } from '@/shared/utils/i18n';

import type { ListSetsParams, StudySetSummaryDto } from '../api/study.types';
import { useStudySets } from '../queries/study-sets.queries';
import { StudySetCard } from './StudySetCard';
import { StudySetListSkeleton } from './StudySetListSkeleton';

export interface StudySetListProps {
  /** Nút trong trạng thái rỗng (vd "Tạo bộ học") — bỏ trống khi không có quyền/ngoại tuyến. */
  emptyActions?: EmptyStateProps['actions'];
  emptyDescription: string;
  /** Icon minh hoạ trạng thái rỗng — mặc định `book`; màn cha đổi sang `search` khi rỗng vì đang tìm/lọc. */
  emptyIcon?: IconName;
  /**
   * Tông hình rỗng — mặc định `success` (bản sắc phân hệ Học: `book` + xanh lục, cùng ô "Học" ở Trang chủ). Rỗng vì đang tìm/lọc
   * thì màn cha truyền `neutral` (quy ước "không có kết quả" của cả app — không phải lỗi, cũng không phải lời mời tạo mới).
   */
  emptyTone?: BannerTone;
  emptyTitle: string;
  enabled?: boolean;
  /**
   * Khối ĐẦU danh sách (thẻ "Hôm nay", lưới chế độ học, banner…) — cuộn CÙNG danh sách nên không chiếm chỗ cố định của màn, và vẫn
   * hiện ở mọi trạng thái (tải/lỗi/rỗng) vì các trạng thái đó nằm TRONG danh sách, ngay dưới khối này.
   */
  header?: ReactElement | null;
  params: ListSetsParams;
  showOwner?: boolean;
  onOpen: (set: StudySetSummaryDto) => void;
}

/**
 * Danh sách bộ học theo phạm vi (cursor 30, `FlashList`) — dùng chung cho "Của tôi", "Khám phá" và "Học của nhóm".
 * Đủ trạng thái: tải (khung xương đúng khuôn thẻ), lỗi + Thử lại tại chỗ, rỗng (kèm nút do nơi gọi quyết theo quyền), "Tải thêm"
 * khi còn trang. Ngoại tuyến: React Query giữ cache nên danh sách đã xem vẫn đọc được.
 *
 * ⚠️ Cả ba trạng thái không-có-dữ-liệu là `ListEmptyComponent` của CHÍNH `FlashList` chứ không thay thế cả danh sách: nhờ vậy `header`
 * và kéo-để-làm-mới luôn còn (lỗi mạng ở "Khám phá" vẫn kéo xuống thử lại được), và danh sách không bị dựng lại khi chuyển trạng thái.
 */
export function StudySetList({
  emptyActions,
  emptyDescription,
  emptyIcon = 'book',
  emptyTitle,
  emptyTone = 'success',
  enabled = true,
  header,
  onOpen,
  params,
  showOwner = false,
}: StudySetListProps) {
  const query = useStudySets(params, enabled);
  const sets = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });

  const placeholder = query.isLoading ? (
    // `busy` + nhãn để người dùng khiếm thị biết đang chờ (khung xương thuần hình thì trình đọc màn hình không nói gì).
    <View
      accessibilityLabel={tCommon('state.loading')}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessible
    >
      <StudySetListSkeleton />
    </View>
  ) : query.isError ? (
    // Mất mạng ≠ app hỏng (`mobile-ux.md`): lỗi KHÔNG TỚI ĐƯỢC máy chủ dùng bộ chữ + hình "ngoại tuyến" (xám, "Kiểm tra kết nối mạng rồi thử lại")
    // chung của bộ — cùng cách các màn khác đã làm; lỗi có phản hồi (4xx/5xx) mới là "Không tải được…" với câu lỗi của BE. `fullscreen={false}`: nằm TRONG danh sách.
    <ScreenState
      action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
      description={isNetworkError(query.error) ? undefined : toErrorMessage(query.error)}
      fullscreen={false}
      state={isNetworkError(query.error) ? 'offline' : 'error'}
      title={isNetworkError(query.error) ? undefined : 'Không tải được danh sách bộ học'}
    />
  ) : (
    <EmptyState
      actions={emptyActions}
      description={emptyDescription}
      icon={emptyIcon}
      title={emptyTitle}
      tone={emptyTone}
    />
  );

  return (
    <FlashList
      contentContainerStyle={{ paddingBottom: SPACING.md }}
      data={sets}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={(set) => set.id}
      ListEmptyComponent={placeholder}
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
      ListHeaderComponent={header}
      refreshControl={refreshControl}
      renderItem={({ item }) => <StudySetCard set={item} showOwner={showOwner} onPress={onOpen} />}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    />
  );
}
