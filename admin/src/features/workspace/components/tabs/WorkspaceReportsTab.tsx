import { memo } from 'react';

import { useAuthStore } from '@/app/store';
import {
  ReportFilters,
  ReportQueueTable,
  useAdminReports,
  useModerationSocket,
  useReportFilters,
} from '@/features/moderation';
import { BoxPanel, Callout, EmptyState, Toolbar } from '@/shared/ui';

import WorkspaceLoadError from '../WorkspaceLoadError';

export interface WorkspaceReportsTabProps {
  workspaceId: string;
}

/**
 * Tab "Báo cáo" của `WorkspaceDetailPage` (admin.md p1-08 §2, §3) — CÙNG hàng đợi kiểm duyệt nền
 * tảng nhưng khoá cứng `workspaceId` (`GET /admin/reports?workspaceId=`). Bảng, bộ lọc và realtime
 * đều dùng lại từ `@/features/moderation`; bấm dòng mở `/moderation/:id` (quay lại đúng tab này).
 *
 * Cần `moderation:view` — thiếu thì KHÔNG gọi API (BE trả 403), chỉ hiện lời giải thích. Bảng chỉ
 * có metadata: nội dung riêng tư xem ở trang chi tiết, có xác nhận và ghi nhật ký (D-06).
 */
const WorkspaceReportsTab = memo(function WorkspaceReportsTab({
  workspaceId,
}: WorkspaceReportsTabProps) {
  const canView = useAuthStore((s) => s.hasPermission('moderation', 'view'));
  const filters = useReportFilters({ workspaceId });
  useModerationSocket();
  const { data, isLoading, isError, error, refetch } = useAdminReports(filters.params, canView);

  if (!canView) {
    return (
      <EmptyState
        description="Tài khoản của bạn không có quyền xem báo cáo kiểm duyệt."
        icon="lock-bold"
        title="Không có quyền xem báo cáo"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Báo cáo được gộp theo đích. Nội dung riêng tư chỉ xem được trong trang chi tiết (có xác nhận và ghi nhật ký)."
        icon="shield-check-bold"
        intent="info"
        variant="ghost"
      />

      <Toolbar left={<ReportFilters showWorkspace={false} state={filters} />} />

      <BoxPanel border="hairline" title="Báo cáo trong workspace">
        {/* Lỗi mà chưa có dữ liệu: đừng vẽ bảng trống — "Không có báo cáo nào" là nói dối khi BE đang lỗi. */}
        {isError && !data ? (
          <div className="p-2">
            <WorkspaceLoadError
              error={error}
              title="Không tải được báo cáo của workspace"
              onRetry={() => void refetch()}
            />
          </div>
        ) : (
          <ReportQueueTable
            currentPage={filters.page}
            hideWorkspace
            loading={isLoading}
            pageSize={filters.pageSize}
            rows={data?.data ?? []}
            total={data?.meta?.total ?? 0}
            onPageChange={filters.setPage}
            onPageSizeChange={filters.setPageSize}
          />
        )}
      </BoxPanel>
    </div>
  );
});

export default WorkspaceReportsTab;
