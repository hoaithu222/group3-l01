import { memo, useCallback } from 'react';

import { useAuthStore } from '@/app/store';
import { useAdminWorkspace } from '@/features/workspace';
import type { WorkspaceOption } from '@/features/workspace';
import { WorkspacePicker } from '@/shared/widgets/workspace-picker';

export interface WorkspaceFilterProps {
  /** `?workspaceId=` — rỗng = toàn hệ thống. */
  workspaceId: string;
  onChange: (workspaceId: string | null) => void;
}

/**
 * Ô lọc workspace của hai bảng (cuộc họp, cuộc gọi). Chọn qua `WorkspacePicker` dùng chung (tìm phía server + "Tải thêm"); tên hiện trên nút lấy
 * từ `GET /admin/workspaces/:id` để `?workspaceId=` mở từ liên kết (vd tab "Cuộc gọi & họp" của workspace) vẫn hiện tên thay vì mã. Cần
 * `workspace:view` — thiếu quyền thì KHÔNG render ô này (bộ lọc theo URL vẫn áp dụng, chỉ là không đổi được tại đây).
 */
const WorkspaceFilter = memo(function WorkspaceFilter({
  workspaceId,
  onChange,
}: WorkspaceFilterProps) {
  const canView = useAuthStore((s) => s.hasPermission('workspace', 'view'));
  const { data } = useAdminWorkspace(canView && workspaceId ? workspaceId : undefined);
  const value: WorkspaceOption | null = workspaceId
    ? { id: workspaceId, name: data?.data.workspace.name ?? 'Workspace đã chọn' }
    : null;

  const handleChange = useCallback(
    (next: WorkspaceOption | null) => onChange(next?.id ?? null),
    [onChange],
  );

  if (!canView) return null;
  return <WorkspacePicker allLabel="Mọi workspace" value={value} onChange={handleChange} />;
});

export default WorkspaceFilter;
