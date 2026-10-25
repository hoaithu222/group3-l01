import { memo } from 'react';

import { Badge } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatNumber } from '@/shared/utils/format';

import type { DeltaGoodWhen, MetricDelta } from '../types/insights.types';
import { deltaTone, formatDeltaPct } from '../utils/insight-delta.utils';

export interface InsightDeltaBadgeProps {
  delta: MetricDelta;
  /** Chỉ số "tốt khi tăng" (mặc định) hay "tốt khi giảm" — quyết định màu, KHÔNG phải hướng mũi tên. */
  goodWhen?: DeltaGoodWhen;
  /** Giá trị kỳ trước — chỉ để ghi vào `title` ("Kỳ trước: 1.234"). */
  previous?: number | null;
}

/**
 * Huy hiệu ▲▼ % so với kỳ trước. Màu theo NGỮ NGHĨA (`deltaTone`): người dùng mới tăng = xanh, không đỏ.
 * Không so sánh được (kỳ trước vắng) ⇒ huy hiệu trung tính "—" thay vì biến mất, để thẻ không đổi cao thấp theo dữ liệu.
 */
const InsightDeltaBadge = memo(function InsightDeltaBadge({
  delta,
  goodWhen = 'up',
  previous,
}: InsightDeltaBadgeProps) {
  const comparable = delta.pct !== null || delta.direction !== 'flat' || previous != null;
  const title = comparable
    ? `So với kỳ trước${previous != null ? ` (${formatNumber(previous)})` : ''}`
    : 'Chưa có kỳ trước để so sánh';

  return (
    <Badge
      className="shrink-0 tabular-nums"
      color={deltaTone(delta.direction, goodWhen)}
      size="sm"
      startIcon={
        delta.direction === 'flat' ? undefined : (
          <SystemIcon
            name={delta.direction === 'up' ? 'arrow-trend-up-bold' : 'arrow-trend-down-bold'}
            size={12}
          />
        )
      }
      title={title}
      variant="tinted"
    >
      {formatDeltaPct(delta)}
    </Badge>
  );
});

export default InsightDeltaBadge;
