import { memo } from 'react';

import { BoxPanel, SummaryCard } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { ProjectBoardRow, ProjectTotals } from '../types/workspace-projects.types';

export interface ProjectKpiPanelProps {
  totals: ProjectTotals;
  boards: readonly ProjectBoardRow[];
}

/**
 * Khối KPI của tab Dự án (p3-02 admin.md §2.1): số bảng (đang dùng / đã lưu trữ), tổng thẻ, thẻ hoàn
 * thành 30 ngày, thẻ quá hạn. Toàn số đếm — không chữ nào lấy từ nội dung thẻ. Số bảng đếm từ danh sách
 * `boards` (BE và admin.md hiểu `totals.boards` khác nhau — xem `ProjectTotals`).
 */
const ProjectKpiPanel = memo(function ProjectKpiPanel({ totals, boards }: ProjectKpiPanelProps) {
  const archived = boards.filter((b) => b.archived).length;
  const active = boards.length - archived;

  return (
    <BoxPanel border="hairline" className="h-auto" title="Tổng quan dự án">
      <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          animate={false}
          color="blue"
          description={`${formatNumber(active)} đang dùng · ${formatNumber(archived)} đã lưu trữ`}
          icon="layer-group-bold"
          label="Số bảng"
          value={boards.length}
        />
        <SummaryCard animate={false} color="gray" icon="square-check-bold" label="Tổng số thẻ" value={totals.tasks} />
        <SummaryCard
          animate={false}
          color="green"
          icon="circle-check-bold"
          label="Hoàn thành 30 ngày"
          value={totals.done30d}
        />
        <SummaryCard
          animate={false}
          color={totals.overdue > 0 ? 'red' : 'gray'}
          icon="clock-bold"
          label="Thẻ quá hạn"
          value={totals.overdue}
        />
      </div>
    </BoxPanel>
  );
});

export default ProjectKpiPanel;
