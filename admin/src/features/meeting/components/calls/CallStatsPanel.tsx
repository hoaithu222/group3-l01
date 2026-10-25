import { memo, useMemo, useState } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { BoxPanel, SegmentToggle, SummaryCard } from '@/shared/ui';

import { CALL_STATS_DAY_OPTIONS, CALL_STATS_DEFAULT_DAYS } from '../../constants/call.constants';
import { NO_DATA } from '../../constants/meeting.constants';
import { useCallStats } from '../../service/meeting.queries';
import { statsRangeFor } from '../../utils/call-ops.utils';
import { formatCount, formatRate } from '../../utils/meeting-ops.utils';
import MediaLoadError from '../common/MediaLoadError';
import CallStatsChart from './CallStatsChart';

const DAYS_KEY = 'days';
const DAY_VALUES = CALL_STATS_DAY_OPTIONS.map((o) => Number(o.key));

export interface CallStatsPanelProps {
  /** Đang lọc một workspace → thống kê cùng workspace đó. */
  workspaceId?: string;
}

/**
 * Đầu tab "Cuộc gọi": thống kê `GET /admin/calls/stats` theo 7/30/90 ngày gần nhất (khoảng chọn sống trên URL `?days=`). Bốn thẻ: số cuộc gọi, phút gọi,
 * tỉ lệ trả lời (chỉ tính cuộc đổ chuông), tỉ lệ kết nối ≤ 20 giây — số liệu chưa có hoặc mẫu số 0 (`null`) hiện `—`, không bao giờ `0`. Kèm biểu đồ theo
 * ngày và theo lý do kết thúc (`CallStatsChart`). Cache 5 phút khớp cache BE. Số liệu tính theo giờ trình duyệt (khoảng ngày cắt tròn nên cùng ngày cùng khoá cache).
 */
const CallStatsPanel = memo(function CallStatsPanel({ workspaceId }: CallStatsPanelProps) {
  const qp = useQueryParams();
  const requested = Number(qp.getParam(DAYS_KEY));
  const days = DAY_VALUES.includes(requested) ? requested : CALL_STATS_DEFAULT_DAYS;
  // Mốc "hôm nay" chốt MỘT lần lúc mở tab (không đọc đồng hồ trong lúc render): mở tab qua đêm thì tải lại trang là có ngày mới.
  const [now] = useState(() => new Date());
  const params = useMemo(() => statsRangeFor(days, now, workspaceId), [days, now, workspaceId]);

  const { data, error, refetch } = useCallStats(params);
  const totals = data?.totals;

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      headerRight={
        <SegmentToggle
          aria-label="Khoảng thời gian thống kê"
          options={CALL_STATS_DAY_OPTIONS}
          value={String(days)}
          onValueChange={(v) =>
            qp.updateParams({ [DAYS_KEY]: v === String(CALL_STATS_DEFAULT_DAYS) ? null : v })
          }
        />
      }
      title={`Thống kê cuộc gọi — ${days} ngày gần nhất`}
    >
      {!data && error ? (
        <div className="p-2">
          <MediaLoadError
            error={error}
            title="Không tải được thống kê cuộc gọi"
            onRetry={() => void refetch()}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              animate={false}
              color="blue"
              description={
                totals
                  ? `${formatCount(totals.ringCalls)} đổ chuông · ${formatCount(totals.roomCalls)} phòng`
                  : undefined
              }
              icon="phone-bold"
              label="Cuộc gọi"
              value={totals ? totals.calls : NO_DATA}
            />
            <SummaryCard
              animate={false}
              color="yellow"
              icon="clock-bold"
              label="Phút gọi"
              value={totals ? totals.minutes : NO_DATA}
            />
            <SummaryCard
              animate={false}
              color="green"
              description="Cuộc đổ chuông có người trả lời"
              icon="circle-check-bold"
              label="Tỉ lệ trả lời"
              value={totals ? formatRate(totals.answerRate) : NO_DATA}
            />
            <SummaryCard
              animate={false}
              color="gray"
              description="Người tham gia kết nối trong ≤ 20 giây"
              icon="bolt-bold"
              label="Tỉ lệ kết nối"
              value={totals ? formatRate(totals.setupSuccessRate) : NO_DATA}
            />
          </div>
          {data && <CallStatsChart stats={data} />}
        </div>
      )}
    </BoxPanel>
  );
});

export default CallStatsPanel;
