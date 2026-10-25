import type { AxiosError } from 'axios';
import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { extractErrorCode } from '@/core/api/error.handler';
import { BoxPanel, Callout, Skeleton, SummaryCard } from '@/shared/ui';
import { formatDate, formatNumber, formatRelativeTime } from '@/shared/utils/format';

import {
  CONTRIBUTION_JOBS_HREF,
  CONTRIBUTION_STATS_DAYS,
  PROJECT_FEATURE_OFF_CODE,
} from '../../constants/workspace-projects.constants';
import { useWorkspaceContributionStats } from '../../service/workspace-projects.queries';
import WorkspaceLoadError from '../WorkspaceLoadError';

export interface WorkspaceContributionStatsProps {
  workspaceId: string;
}

/**
 * Khối "Báo cáo đóng góp" trong tab "Dự án" của workspace (p4-06 admin.md §2.2) — CHỈ số đếm về sức khoẻ tính năng:
 * bảng dùng trọng số tuỳ chỉnh, PDF đã xuất/lỗi trong 30 ngày, lần tính lại gần nhất, bảng đang chờ tính lại. KHÔNG có
 * hành động ghi và KHÔNG có điểm, tỷ lệ, hoạt động theo ngày hay danh sách thẻ của thành viên (dữ liệu học tập của nhóm).
 *
 * Có bảng chờ tính lại quá 1 giờ ⇒ `Callout` cảnh báo kèm liên kết tới trang Jobs (chỉ khi có `system-config:view`).
 * Cờ `project` tắt giữa chừng (404 `CFG_005`) ⇒ khối ẩn — tab cha đã báo "Dự án đang tắt".
 */
const WorkspaceContributionStats = memo(function WorkspaceContributionStats({
  workspaceId,
}: WorkspaceContributionStatsProps) {
  const canViewJobs = useAuthStore((s) => s.hasPermission)('system-config', 'view');
  const { data, isLoading, error, refetch } = useWorkspaceContributionStats(workspaceId);
  const stats = data?.data;

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Đang tải số liệu báo cáo đóng góp" role="status">
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!stats) {
    if (error && extractErrorCode(error as AxiosError) === PROJECT_FEATURE_OFF_CODE) return null;
    return (
      <WorkspaceLoadError
        error={error}
        title="Không tải được số liệu báo cáo đóng góp"
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      description="Chỉ số đếm về tính năng — không có điểm, tỷ lệ hay hoạt động của từng thành viên."
      title="Báo cáo đóng góp"
    >
      <div className="flex flex-col gap-2 p-2">
        {stats.staleBoards > 0 && (
          <Callout
            action={
              canViewJobs ? (
                <Link className="text-link hover:underline" to={CONTRIBUTION_JOBS_HREF}>
                  Mở trang Jobs
                </Link>
              ) : undefined
            }
            description="Kiểm tra job contribution.recompute ở trang Jobs."
            intent="warning"
            title={`${formatNumber(stats.staleBoards)} bảng chờ tính lại quá 1 giờ`}
          />
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            animate={false}
            color="blue"
            icon="sliders-bold"
            label="Bảng dùng trọng số tuỳ chỉnh"
            value={stats.boardsWithCustomWeights}
          />
          <SummaryCard
            animate={false}
            color="green"
            icon="file-lines-bold"
            label={`Báo cáo PDF đã xuất (${CONTRIBUTION_STATS_DAYS} ngày)`}
            value={stats.exports.ready}
          />
          <SummaryCard
            animate={false}
            color={stats.exports.failed > 0 ? 'red' : 'gray'}
            icon="triangle-exclamation-bold"
            label={`Xuất PDF lỗi (${CONTRIBUTION_STATS_DAYS} ngày)`}
            value={stats.exports.failed}
          />
          <SummaryCard
            animate={false}
            color="gray"
            description={
              stats.lastComputedAt ? formatRelativeTime(stats.lastComputedAt) : undefined
            }
            icon="arrows-rotate-bold"
            label="Lần tính lại gần nhất"
            value={
              stats.lastComputedAt
                ? formatDate(stats.lastComputedAt, 'HH:mm DD/MM/YYYY')
                : 'Chưa tính lần nào'
            }
          />
          <SummaryCard
            animate={false}
            color={stats.staleBoards > 0 ? 'yellow' : 'gray'}
            icon="clock-bold"
            label="Bảng đang chờ tính lại"
            value={stats.pendingBoards}
          />
        </div>
      </div>
    </BoxPanel>
  );
});

export default WorkspaceContributionStats;
