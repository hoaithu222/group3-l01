import { memo } from 'react';
import type { CSSProperties } from 'react';

import { tokenVar } from '@/shared/charts';
import { Text } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { INSIGHT_PREVIOUS_TOKEN } from '../constants/insights.constants';
import type { TrendRow } from '../types/insights.types';
import {
  computeDelta,
  deltaTone,
  formatDeltaPct,
  formatSignedNumber,
} from '../utils/insight-delta.utils';

export interface ActivityTrendTooltipProps {
  /** Do Recharts điền khi nhân bản phần tử `content`. */
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TrendRow }>;
  /** `contentStyle` sinh từ `useChartMetrics` của chart cha — tooltip cũng to lên theo bậc mật độ / chế độ TV. */
  style?: CSSProperties;
  /** Màu series kỳ hiện tại. */
  token: string;
  unit: string;
}

const TONE_SKIN = { success: 'success', error: 'error', neutral: 'muted' } as const;

/**
 * Tooltip của biểu đồ xu hướng: ngày · kỳ này · kỳ trước (kèm NGÀY THẬT của kỳ trước) · chênh lệch.
 *
 * Tooltip mặc định của Recharts chỉ liệt kê từng series rời nhau, mà câu hỏi thật là "so với kỳ trước thì hơn/kém bao nhiêu" — nên có thêm dòng
 * chênh lệch (số + %) cùng quy ước dấu/màu với huy hiệu ▲▼ ở thẻ KPI. Kỳ trước vắng ⇒ không có hai dòng cuối (không bịa "kỳ trước 0").
 */
const ActivityTrendTooltip = memo(function ActivityTrendTooltip({
  active,
  payload,
  style,
  token,
  unit,
}: ActivityTrendTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const hasPrevious = row.previous !== null;
  const delta = computeDelta({ current: row.current, previous: row.previous });
  const showPct = delta.pct !== null || delta.direction !== 'flat';

  return (
    <div className="flex min-w-44 flex-col gap-1.5" style={style}>
      <Text className="text-fg-1" size="small" weight="medium">
        {formatDate(row.date, 'DD/MM/YYYY')}
      </Text>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: tokenVar(token) }}
        />
        <Text className="flex-1 text-fg-3" size="tiny">
          Kỳ này
        </Text>
        <Text className="tabular-nums text-fg-1" size="tiny" weight="medium">
          {formatNumber(row.current)} {unit}
        </Text>
      </div>
      {hasPrevious && (
        <>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-0 w-2 shrink-0 border-t-2 border-dashed"
              style={{ borderColor: tokenVar(INSIGHT_PREVIOUS_TOKEN) }}
            />
            <Text className="flex-1 text-fg-3" size="tiny">
              Kỳ trước{row.previousDate ? ` (${formatDate(row.previousDate, 'DD/MM')})` : ''}
            </Text>
            <Text className="tabular-nums text-fg-1" size="tiny" weight="medium">
              {formatNumber(row.previous ?? 0)} {unit}
            </Text>
          </div>
          <div className="flex items-center gap-2 border-t border-border-1 pt-1.5">
            <Text className="flex-1 text-fg-4" size="tiny">
              Chênh lệch
            </Text>
            <Text
              className="tabular-nums"
              size="tiny"
              skin={TONE_SKIN[deltaTone(delta.direction)]}
              weight="medium"
            >
              {formatSignedNumber(row.current - (row.previous ?? 0))}
              {showPct ? ` (${formatDeltaPct(delta)})` : ''}
            </Text>
          </div>
        </>
      )}
    </div>
  );
});

export default ActivityTrendTooltip;
