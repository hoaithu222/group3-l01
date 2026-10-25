import type { AxiosError } from 'axios';
import { memo, type ReactNode } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { WorkspaceReviewStats } from '@/features/peer-review';
import { Callout, EmptyState, Skeleton } from '@/shared/ui';

import { PROJECT_FEATURE_OFF_CODE } from '../../constants/workspace-projects.constants';
import { useWorkspaceProjectStats } from '../../service/workspace-projects.queries';
import ProjectBoardsTable from '../ProjectBoardsTable';
import ProjectDoneByWeekChart from '../ProjectDoneByWeekChart';
import ProjectKpiPanel from '../ProjectKpiPanel';
import WorkspaceLoadError from '../WorkspaceLoadError';
import WorkspaceContributionStats from './WorkspaceContributionStats';

export interface WorkspaceProjectsTabProps {
  workspaceId: string;
}

/**
 * Tab "Dự án" của `WorkspaceDetailPage` (p3-02 admin.md §2.1) — CHỈ đọc, KHÔNG có hành động ghi (bảng
 * thuộc chủ nhóm). Số liệu: số bảng, tổng thẻ, hoàn thành 30 ngày, quá hạn, danh sách bảng (tên bảng
 * là metadata tổ chức nên có hiển thị) và biểu đồ hoàn thành theo tuần. Tiêu đề/mô tả thẻ là dữ liệu
 * của nhóm nên KHÔNG hiển thị (cổng ra Phase 3 mục 5). Cuối tab là khối "Báo cáo đóng góp" (p4-06 admin.md §2.2,
 * `WorkspaceContributionStats`) — cũng chỉ số đếm về sức khoẻ tính năng, không có điểm/tỷ lệ của thành viên —
 * rồi khối "Chấm chéo" (p4-05 admin.md §2.2, `WorkspaceReviewStats` của `@/features/peer-review`; tự tải, tự ẩn khi cờ
 * `project` tắt, tự báo lỗi tải).
 *
 * Cờ `project` tắt giữa chừng (capabilities cache 5 phút) ⇒ BE trả 404 `CFG_005`: hiện trạng thái
 * "dự án đang tắt" thay vì báo lỗi.
 */
const WorkspaceProjectsTab = memo(function WorkspaceProjectsTab({
  workspaceId,
}: WorkspaceProjectsTabProps) {
  const { data, isLoading, error, refetch } = useWorkspaceProjectStats(workspaceId);
  const stats = data?.data;

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div aria-busy="true" aria-label="Đang tải số liệu dự án" className="flex flex-col gap-2" role="status">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  } else if (!stats) {
    const featureOff = error ? extractErrorCode(error as AxiosError) === PROJECT_FEATURE_OFF_CODE : false;
    body = featureOff ? (
      <EmptyState
        description="Phân hệ dự án đang tắt trên hệ thống nên chưa có số liệu."
        icon="layer-group-bold"
        title="Dự án đang tắt"
      />
    ) : (
      <WorkspaceLoadError
        error={error}
        title="Không tải được số liệu dự án"
        onRetry={() => void refetch()}
      />
    );
  } else {
    body = (
      <>
        <ProjectKpiPanel boards={stats.boards} totals={stats.totals} />
        <ProjectBoardsTable rows={stats.boards} />
        <ProjectDoneByWeekChart data={stats.doneByWeek} />
        <WorkspaceContributionStats workspaceId={workspaceId} />
        <WorkspaceReviewStats workspaceId={workspaceId} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Callout
        description="Vì quyền riêng tư, trang quản trị chỉ hiển thị số liệu và tên bảng. Tiêu đề, mô tả, nhãn, người làm và bình luận của thẻ không được hiển thị ở đây."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      {body}
    </div>
  );
});

export default WorkspaceProjectsTab;
