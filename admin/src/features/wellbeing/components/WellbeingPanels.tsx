import { memo } from 'react';

import { BoxPanel, EmptyState, Text } from '@/shared/ui';

import type { AlertsWeek, LevelBucket } from '../types/wellbeing.types';
import { hasAlerts } from '../utils/overview.utils';
import AlertsPerWeekChart from './AlertsPerWeekChart';
import AlertsPerWeekTable from './AlertsPerWeekTable';
import LevelDistributionChart from './LevelDistributionChart';
import LevelDistributionTable from './LevelDistributionTable';

export interface WellbeingPanelsProps {
  alertsPerWeek: readonly AlertsWeek[];
  /** `null` = số người đã được chấm điểm còn quá ít để công bố phân bố. */
  levelDistribution: readonly LevelBucket[] | null;
}

/**
 * Hai khung biểu đồ của tổng quan ẨN DANH khi ĐỦ mẫu (admin.md p7-03 §2.1): cảnh báo theo tuần và phân bố mức hiện tại — mỗi khung có bảng số liệu thay thế bên dưới.
 * Chỉ vẽ khi BE đã công bố (đủ người; ô nhỏ đã che/gộp); không tự suy thêm bất kỳ con số nào.
 */
const WellbeingPanels = memo(function WellbeingPanels({
  alertsPerWeek,
  levelDistribution,
}: WellbeingPanelsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <BoxPanel border="hairline" className="h-auto" title="Cảnh báo theo tuần">
        <div className="flex flex-col gap-3 p-2">
          {hasAlerts(alertsPerWeek) ? (
            <>
              <AlertsPerWeekChart data={alertsPerWeek} />
              <Text weight="bold">Số liệu theo tuần</Text>
              <AlertsPerWeekTable data={alertsPerWeek} />
            </>
          ) : (
            <EmptyState
              description="Chưa có cảnh báo nào trong khoảng đã chọn."
              icon="chart-simple-bold"
              size="sm"
              title="Chưa có dữ liệu"
            />
          )}
        </div>
      </BoxPanel>
      <BoxPanel border="hairline" className="h-auto" title="Phân bố mức hiện tại">
        <div className="flex flex-col gap-3 p-2">
          {levelDistribution ? (
            <>
              <LevelDistributionChart data={levelDistribution} />
              <Text weight="bold">Số liệu theo mức</Text>
              <LevelDistributionTable data={levelDistribution} />
            </>
          ) : (
            <EmptyState
              description="Chưa đủ người được chấm điểm để công bố phân bố mà không nhận ra cá nhân."
              icon="shield-check-bold"
              size="sm"
              title="Chưa đủ dữ liệu ẩn danh"
            />
          )}
        </div>
      </BoxPanel>
    </div>
  );
});

export default WellbeingPanels;
