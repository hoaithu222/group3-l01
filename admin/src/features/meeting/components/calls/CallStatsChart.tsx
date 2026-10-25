import { memo } from 'react';

import { BoxPanel } from '@/shared/ui';

import type { CallStats } from '../../types/call.types';
import CallEndReasonChart from './CallEndReasonChart';
import CallRateChart from './CallRateChart';
import CallVolumeChart from './CallVolumeChart';

export interface CallStatsChartProps {
  stats: CallStats;
}

/**
 * Cụm biểu đồ thống kê cuộc gọi (admin.md p2-07 §2.3, P1): số cuộc gọi + phút theo ngày, tỉ lệ kết nối/trả lời theo ngày, lý do kết thúc.
 * Chỉ bố cục ba khung — mỗi biểu đồ là một component riêng (`chart-conventions.md §2.1`). Xuất CSV KHÔNG có: BE bỏ `/admin/calls/export`.
 */
const CallStatsChart = memo(function CallStatsChart({ stats }: CallStatsChartProps) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <BoxPanel border="hairline" className="h-auto" title="Cuộc gọi và phút gọi theo ngày">
        <div className="p-2">
          <CallVolumeChart data={stats.byDay} />
        </div>
      </BoxPanel>
      <BoxPanel border="hairline" className="h-auto" title="Tỉ lệ kết nối và trả lời theo ngày">
        <div className="p-2">
          <CallRateChart data={stats.byDay} />
        </div>
      </BoxPanel>
      <BoxPanel border="hairline" className="h-auto" title="Lý do kết thúc">
        <div className="p-2">
          <CallEndReasonChart data={stats.byEndReason} />
        </div>
      </BoxPanel>
    </div>
  );
});

export default CallStatsChart;
