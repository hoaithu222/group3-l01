import type { AxiosError } from 'axios';
import { memo } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { BoxPanel, Callout, Skeleton } from '@/shared/ui';
import { formatNumber, formatPercent } from '@/shared/utils/format';

import {
  AUTO_APPROVE_WARN_RATIO,
  PROJECT_FEATURE_OFF_CODE,
  REVIEW_STATS_DAYS,
} from '../constants/peer-review.constants';
import { useWorkspaceReviewStats } from '../service/peer-review.queries';
import { autoApproveRatio, isAutoApproveHigh } from '../utils/review-stats.utils';
import ReviewBoardsTable from './ReviewBoardsTable';
import ReviewKpiGrid from './ReviewKpiGrid';
import ReviewStatsLoadError from './ReviewStatsLoadError';

export interface WorkspaceReviewStatsProps {
  workspaceId: string;
  /** Cửa sổ (ngày) của số đếm theo kỳ; mặc định 30. */
  days?: number;
}

/**
 * Khối "Chấm chéo" trong tab "Dự án" của workspace (p4-05 admin.md §2.2) — CHỈ số đếm: lượt đang mở, lượt chờ quá
 * 72 giờ, thời gian chấm trung vị, lượt tự duyệt/miễn chấm và số lượt mở theo bảng. KHÔNG có hành động ghi (chấm chéo
 * thuộc chủ nhóm) và KHÔNG có tên người chấm, điểm, nhận xét hay tiêu đề thẻ (dữ liệu học tập của nhóm).
 *
 * Tỉ lệ tự duyệt > 30 % ⇒ `Callout` thông tin (không có hành động). Cờ `project` tắt giữa chừng (404 `CFG_005`) ⇒ khối
 * ẩn — tab cha đã báo "Dự án đang tắt". Lỗi tải khác có trạng thái riêng, không hiện `0`.
 *
 * Nối vào `WorkspaceProjectsTab`: `<WorkspaceReviewStats workspaceId={workspaceId} />` (import từ `@/features/peer-review`).
 */
const WorkspaceReviewStats = memo(function WorkspaceReviewStats({
  workspaceId,
  days = REVIEW_STATS_DAYS,
}: WorkspaceReviewStatsProps) {
  const { data, isLoading, error, refetch } = useWorkspaceReviewStats(workspaceId, days);
  const stats = data?.data;

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Đang tải số liệu chấm chéo" role="status">
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!stats) {
    if (error && extractErrorCode(error as AxiosError) === PROJECT_FEATURE_OFF_CODE) return null;
    return <ReviewStatsLoadError error={error} onRetry={() => void refetch()} />;
  }

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      description={`Chỉ số đếm ${days} ngày gần nhất — không có tên người chấm, điểm hay nhận xét.`}
      title="Chấm chéo"
    >
      <div className="flex flex-col gap-2 p-2">
        {isAutoApproveHigh(stats) && (
          <Callout
            description={`${formatPercent(autoApproveRatio(stats) * 100)} lượt chấm trong ${days} ngày phải tự duyệt vì không đủ người chấm (mức gợi ý: dưới ${formatNumber(AUTO_APPROVE_WARN_RATIO * 100)}%). Chủ nhóm có thể giảm số lượt duyệt của bảng.`}
            intent="info"
            title="Nhóm có thể quá nhỏ cho số lượt duyệt đang đặt"
          />
        )}
        <ReviewKpiGrid days={days} stats={stats} />
        <ReviewBoardsTable rows={stats.byBoard} />
      </div>
    </BoxPanel>
  );
});

export default WorkspaceReviewStats;
