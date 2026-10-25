import { memo } from 'react';

import { Badge, BoxPanel, Progress, SummaryCard } from '@/shared/ui';
import { formatFileSize, formatNumber } from '@/shared/utils/format';

import type { ResourceStatsView } from '../types/workspace-resources.types';
import {
  formatUsagePercent,
  usagePercent,
  usageVariantOf,
} from '../utils/workspace-resources.utils';

export interface ResourceUsagePanelProps {
  stats: ResourceStatsView;
}

/**
 * Khối "Dung lượng" của tab Tài liệu (p3-01 admin.md §2.1): thanh đã dùng / hạn mức + bốn
 * `SummaryCard` (đã dùng, số tệp, số thư mục, thùng rác). TOÀN BỘ là số đo — không tên tệp/thư mục.
 */
const ResourceUsagePanel = memo(function ResourceUsagePanel({ stats }: ResourceUsagePanelProps) {
  const percent = usagePercent(stats.usedBytes, stats.quotaBytes);

  return (
    <BoxPanel border="hairline" className="h-auto" title="Dung lượng kho tài liệu">
      <div className="flex flex-col gap-3 p-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="tabular-nums text-body-14-medium text-fg-1">
              {formatFileSize(stats.usedBytes)} / {formatFileSize(stats.quotaBytes)}
              <span className="ml-2 text-fg-3">{formatUsagePercent(percent)}</span>
            </span>
            <Badge color={stats.quotaSource === 'OVERRIDE' ? 'warning' : 'neutral'} variant="tinted">
              {stats.quotaSource === 'OVERRIDE' ? 'Hạn mức riêng' : 'Hạn mức mặc định'}
            </Badge>
          </div>
          <Progress size="md" value={percent ?? 0} variant={usageVariantOf(percent)} />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            animate={false}
            color="blue"
            icon="boxes-stacked-bold"
            label="Đã dùng"
            value={formatFileSize(stats.usedBytes)}
          />
          <SummaryCard
            animate={false}
            color="green"
            icon="files-bold"
            label="Số tệp"
            value={formatNumber(stats.fileCount)}
          />
          <SummaryCard
            animate={false}
            color="gray"
            icon="folder-bold"
            label="Số thư mục"
            value={formatNumber(stats.folderCount)}
          />
          <SummaryCard
            animate={false}
            color={stats.trashBytes > 0 ? 'yellow' : 'gray'}
            description="Vẫn tính vào dung lượng đã dùng"
            icon="trash-bold"
            label="Thùng rác"
            value={formatFileSize(stats.trashBytes)}
          />
        </div>
      </div>
    </BoxPanel>
  );
});

export default ResourceUsagePanel;
