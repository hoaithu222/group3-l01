import { memo } from 'react';
import type { ReactNode } from 'react';

import { EmptyState, Skeleton } from '@/shared/ui';
import type { SystemIconName } from '@/shared/ui';

export interface WorkspaceGatedTabProps {
  /** Cờ tính năng bật VÀ đủ quyền xem (xem `useWorkspaceTabs`). */
  enabled: boolean;
  /** Cờ tính năng chưa tải xong — chờ thay vì kết luận vội "không khả dụng". */
  pending: boolean;
  icon: SystemIconName;
  /** Tiêu đề khung "không khả dụng". */
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Khung bọc tab phụ thuộc cờ tính năng: bật → nội dung tab; chưa biết cờ → khung chờ (deep link `?tab=` không chớp "không khả dụng"); tắt hoặc thiếu
 * quyền → `EmptyState` giải thích, và nội dung tab KHÔNG được mount nên không gọi API.
 */
const WorkspaceGatedTab = memo(function WorkspaceGatedTab({
  enabled,
  pending,
  icon,
  title,
  description,
  children,
}: WorkspaceGatedTabProps) {
  if (enabled) return <>{children}</>;
  if (pending) return <Skeleton className="h-40 w-full" />;
  return <EmptyState description={description} icon={icon} title={title} />;
});

export default WorkspaceGatedTab;
