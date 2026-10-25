import type { ReactNode } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

export interface EditorGateProps {
  children: ReactNode;
  /** Tác giả + bộ còn `ACTIVE` — bộ bị ẩn/không phải của mình thì không sửa được. */
  editable: boolean;
  /** Đã có dữ liệu bộ (khác `loadError`: bộ đã xoá/không còn quyền thì không lỗi nhưng cũng không có bộ). */
  hasSet: boolean;
  isLoading: boolean;
  loadError: unknown;
  onRetry: () => void;
}

/**
 * Cổng trạng thái của trình soạn: đang tải (khung xương dạng thanh tóm tắt + vài hàng mục, giữ đúng chỗ bố cục) → lỗi nạp (kèm "Thử
 * lại") / bộ không còn → không có quyền sửa → hiện nội dung. Tách khỏi `SetEditorScreen` để màn chỉ còn phần điều phối.
 *
 * ⚠️ "Thử lại" chỉ khi là LỖI nạp; không kèm lỗi là bộ học không còn — bấm thử lại chẳng ra gì.
 */
export function EditorGate({
  children,
  editable,
  hasSet,
  isLoading,
  loadError,
  onRetry,
}: EditorGateProps) {
  if (isLoading) {
    return (
      <View
        accessibilityLabel="Đang tải nội dung bộ học"
        accessibilityRole="progressbar"
        accessible
        className="gap-sm px-md py-sm"
      >
        <Skeleton className="h-10 rounded-sm" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </View>
    );
  }
  if (loadError || !hasSet) {
    return (
      <EmptyState
        actions={loadError ? [{ label: 'Thử lại', onPress: onRetry }] : undefined}
        description={loadError ? toErrorMessage(loadError) : 'Bộ học không còn khả dụng.'}
        icon="alert-warning"
        title="Không mở được trình soạn"
        tone="danger"
      />
    );
  }
  if (!editable) {
    return (
      <EmptyState
        description="Chỉ tác giả mới sửa được nội dung, và bộ bị ẩn thì không sửa được."
        icon="lock"
        title="Không thể sửa"
        tone="warning"
      />
    );
  }
  return <>{children}</>;
}
