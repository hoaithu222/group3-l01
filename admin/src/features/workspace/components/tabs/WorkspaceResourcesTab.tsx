import type { AxiosError } from 'axios';
import { memo, useCallback, type ReactNode } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { BoxPanel, Callout, EmptyState, Skeleton } from '@/shared/ui';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import {
  RESOURCE_AUDIT_ACTIONS,
  RESOURCE_FEATURE_OFF_CODE,
} from '../../constants/workspace-resources.constants';
import { useWorkspaceResourceStats } from '../../service/workspace-resources.queries';
import ResourceByTypeTable from '../ResourceByTypeTable';
import ResourceQuotaPanel from '../ResourceQuotaPanel';
import ResourceUsagePanel from '../ResourceUsagePanel';
import WorkspaceLoadError from '../WorkspaceLoadError';

export interface WorkspaceResourcesTabProps {
  workspaceId: string;
}

/**
 * Tab "Tài liệu" của `WorkspaceDetailPage` (p3-01 admin.md §2.1) — CHỈ SỐ LIỆU dung lượng: đã dùng /
 * hạn mức, số tệp, số thư mục, thùng rác, theo loại, cùng hạn mức riêng. Kho tài liệu là dữ liệu của
 * nhóm nên KHÔNG có tên tệp, tên thư mục hay nội dung ở đây (cổng ra Phase 3 mục 5).
 *
 * Cờ `project` tắt giữa chừng (capabilities cache 5 phút) ⇒ BE trả 404 `CFG_005`: hiện trạng thái
 * "kho tài liệu đang tắt" thay vì báo lỗi.
 */
const WorkspaceResourcesTab = memo(function WorkspaceResourcesTab({
  workspaceId,
}: WorkspaceResourcesTabProps) {
  const { data, isLoading, error, refetch } = useWorkspaceResourceStats(workspaceId);
  const stats = data?.data;

  // Trả hạn mức mới để modal nạp lại ô nhập sau 409; lỗi tải lại → `undefined` (giữ giá trị cũ).
  const reload = useCallback(async () => (await refetch()).data?.data.quotaBytes, [refetch]);

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div
        aria-busy="true"
        aria-label="Đang tải số liệu tài liệu"
        className="flex flex-col gap-2"
        role="status"
      >
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else if (!stats) {
    const featureOff = error
      ? extractErrorCode(error as AxiosError) === RESOURCE_FEATURE_OFF_CODE
      : false;
    body = featureOff ? (
      <EmptyState
        description="Phân hệ dự án và tài liệu đang tắt trên hệ thống nên chưa có số liệu."
        icon="folder-bold"
        title="Kho tài liệu đang tắt"
      />
    ) : (
      <WorkspaceLoadError
        error={error}
        title="Không tải được số liệu tài liệu"
        onRetry={() => void refetch()}
      />
    );
  } else {
    body = (
      <>
        <ResourceUsagePanel stats={stats} />
        <ResourceByTypeTable rows={stats.byType} />
        <ResourceQuotaPanel stats={stats} workspaceId={workspaceId} onReload={reload} />
        {/* BE ghi audit `resource.quota-override` với targetType "WORKSPACE" (viết hoa, khác "Workspace" của lưu trữ nhóm). */}
        <BoxPanel border="hairline" className="h-auto" title="Nhật ký hạn mức kho tài liệu">
          <div className="p-2">
            <AuditTrailPanel
              actions={RESOURCE_AUDIT_ACTIONS}
              targetId={workspaceId}
              targetType="WORKSPACE"
            />
          </div>
        </BoxPanel>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Callout
        description="Vì quyền riêng tư, trang quản trị chỉ hiển thị số liệu dung lượng. Tên tệp, tên thư mục và nội dung kho tài liệu của nhóm không được hiển thị ở đây."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      {body}
    </div>
  );
});

export default WorkspaceResourcesTab;
