import { View } from 'react-native';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Divider } from '@/shared/ui/divider';
import { EmptyState } from '@/shared/ui/empty-state';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { toErrorMessage } from '@/shared/utils/errors';

import { useLocationReviews } from '../queries/locations.queries';
import { ReviewRow } from './ReviewRow';

export interface ReviewsSheetProps {
  locationId: string;
  visible: boolean;
  onClose: () => void;
}

/** Tất cả đánh giá (cursor) — chỉ tải khi tờ mở. Đánh giá bị ẩn bởi vận hành đã được BE loại (`hiddenAt`), app không lọc lại. */
export function ReviewsSheet({ locationId, visible, onClose }: ReviewsSheetProps) {
  const query = useLocationReviews(locationId, visible);
  const reviews = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <BottomSheet padded={false} scrollable title="Đánh giá" visible={visible} onClose={onClose}>
      <SheetList className="pb-md">
        {query.isPending ? (
          // Khung chờ cùng DÁNG hàng đánh giá (ảnh đại diện + dòng chữ) — hai khối xám trơn không cho biết sắp hiện gì.
          <View className="gap-md py-sm">
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
          </View>
        ) : query.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
            description={toErrorMessage(query.error)}
            icon="alert-warning"
            size="compact"
            title="Không tải được đánh giá"
            tone="danger"
          />
        ) : reviews.length === 0 ? (
          <EmptyState icon="star" size="compact" title="Chưa có đánh giá" tone="neutral" />
        ) : (
          reviews.map((review, index) => (
            <View key={review.id}>
              {index > 0 ? <Divider /> : null}
              <ReviewRow review={review} />
            </View>
          ))
        )}
        {query.hasNextPage ? (
          <Button
            fullWidth
            label="Xem thêm"
            loading={query.isFetchingNextPage}
            variant="secondary"
            onPress={() => void query.fetchNextPage()}
          />
        ) : null}
      </SheetList>
    </BottomSheet>
  );
}
