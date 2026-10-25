import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import type { InsightsMetric } from '@/core/api/admin';
import { tokenVar, tokenVarAlpha } from '@/shared/charts';
import { Text } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { INSIGHT_PREVIOUS_TOKEN } from '../constants/insights.constants';
import { computeDelta } from '../utils/insight-delta.utils';
import InsightDeltaBadge from './InsightDeltaBadge';

export interface ActivityTrendLegendProps {
  /** Token màu series scale `-5` của chỉ số đang chọn. */
  token: string;
  /** Khoảng ngày của kỳ này, vd `06/09 – 05/10`. */
  currentRange: string;
  /** Khoảng ngày của kỳ trước; rỗng ⇒ BE không có kỳ trước, không hiện mục này. */
  previousRange: string;
  /** Trung bình/ngày kỳ này (đã làm tròn); vắng ⇒ không hiện mục "Trung bình". */
  average?: number;
  /** Số tổng kỳ (kèm kỳ trước) của chỉ số — hiện huy hiệu ▲▼ nếu có. */
  total?: InsightsMetric;
}

/** Mục chú giải: ký hiệu nét/chấm + chữ. (Hàm trả JSX, không phải component.) */
const legendItem = (glyph: ReactNode, text: string) => (
  <span className="flex items-center gap-1.5 whitespace-nowrap">
    {glyph}
    <Text size="tiny" skin="muted">
      {text}
    </Text>
  </span>
);

/** Ký hiệu một NÉT KẺ (đứt / liền) — cùng kiểu nét với đường trên biểu đồ để chú giải không nói dối. */
const lineGlyph = (borderStyle: 'dashed' | 'solid', color: string) => {
  const style: CSSProperties = { borderColor: color };
  return (
    <span
      aria-hidden
      className={`h-0 w-4 shrink-0 border-t-2 ${borderStyle === 'dashed' ? 'border-dashed' : 'border-solid'}`}
      style={style}
    />
  );
};

/**
 * Chú giải của biểu đồ xu hướng: kỳ này (chấm màu series) · kỳ trước (nét đứt xám) · trung bình (nét mảnh nhạt), kèm huy hiệu ▲▼ của số tổng kỳ.
 * Dựng bằng HTML thay vì `<Legend>` của Recharts vì mỗi mục cần kèm KHOẢNG NGÀY cụ thể — "kỳ trước" mà không nói là ngày nào thì không kiểm chứng được.
 */
const ActivityTrendLegend = memo(function ActivityTrendLegend({
  token,
  currentRange,
  previousRange,
  average,
  total,
}: ActivityTrendLegendProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {legendItem(
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: tokenVar(token) }}
          />,
          `Kỳ này ${currentRange}`,
        )}
        {previousRange &&
          legendItem(
            lineGlyph('dashed', tokenVar(INSIGHT_PREVIOUS_TOKEN)),
            `Kỳ trước ${previousRange}`,
          )}
        {average !== undefined &&
          legendItem(lineGlyph('solid', tokenVarAlpha(token, 0.6)), `Trung bình ${formatNumber(average)}`)}
      </div>
      {total && (
        <span className="flex items-center gap-1.5">
          <InsightDeltaBadge delta={computeDelta(total)} previous={total.previous} />
          <Text size="tiny" skin="muted">
            so với kỳ trước
          </Text>
        </span>
      )}
    </div>
  );
});

export default ActivityTrendLegend;
