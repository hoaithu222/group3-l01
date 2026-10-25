import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';

import type { SectionContext } from '../api/plagiarism.types';
import { ExcerptPane } from './ExcerptPane';

interface ComparisonViewerProps {
  context: SectionContext | undefined;
  /** Tải nội dung đoạn lỗi — hiện khối lỗi có "Thử lại" thay cho khung xương đứng im mãi. */
  error?: boolean;
  loading: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  onRetry?: () => void;
  position?: string;
}

/**
 * Viewer đối chiếu (app.md §3): tablet ≥ breakpoint `tablet` → 2 cột cuộn độc lập; điện thoại → xếp chồng. Đổi bố cục
 * bằng CLASS (`flex-col tablet:flex-row`, khuyến nghị của `useResponsiveValue` khi có `className`) thay vì hook, để
 * không vẽ lại cả cây con mỗi nhịp đổi kích thước.
 *
 * Hàng điều hướng: mũi tên trong nút (không chỉ chữ) + vị trí `n/tổng` giữa hai nút, chữ `fg-2` (fg-3 không đạt tương phản).
 */
export function ComparisonViewer({
  context,
  error = false,
  loading,
  onNext,
  onPrev,
  onRetry,
  position,
}: ComparisonViewerProps) {
  return (
    <View className="gap-sm">
      {error ? (
        <View className="rounded-md border-hairline border-border-1 bg-bg-1 p-md">
          <EmptyState
            actions={onRetry ? [{ label: 'Thử lại', onPress: onRetry }] : undefined}
            description="Chưa tải được nội dung của đoạn này. Kiểm tra kết nối rồi thử lại."
            icon="alert-warning"
            size="compact"
            title="Không tải được đoạn đối chiếu"
            tone="danger"
          />
        </View>
      ) : (
        <View className="gap-sm tablet:flex-row">
          <View className="flex-1">
            <ExcerptPane excerpt={context?.left} loading={loading} title="Tệp của nhóm" />
          </View>
          <View className="flex-1">
            <ExcerptPane excerpt={context?.right} loading={loading} title="Nguồn trùng" />
          </View>
        </View>
      )}
      {onPrev || onNext ? (
        <View className="flex-row items-center justify-between gap-xs">
          <Button
            disabled={!onPrev}
            iconLeft="arrow-left-small"
            label="Đoạn trước"
            size="sm"
            variant="secondary"
            onPress={onPrev}
          />
          {position ? (
            <Text
              accessibilityLabel={`Đoạn ${position.replace('/', ' trên ')}`}
              className="text-label-md font-semibold text-fg-2"
            >
              {position}
            </Text>
          ) : null}
          <Button
            disabled={!onNext}
            iconRight="arrow-right-small"
            label="Đoạn sau"
            size="sm"
            variant="secondary"
            onPress={onNext}
          />
        </View>
      ) : null}
    </View>
  );
}
