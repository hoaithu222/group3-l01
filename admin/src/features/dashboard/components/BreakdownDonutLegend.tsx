import { memo } from 'react';

import { cn } from '@/shared/utils/style/cn';

import type { InsightsBreakdownItem } from '@/core/api/admin';
import type { BreakdownColorOf } from '../utils/breakdown.utils';
import BreakdownDonutChart from './BreakdownDonutChart';
import BreakdownLegend from './BreakdownLegend';

export interface BreakdownDonutLegendProps {
  items: readonly InsightsBreakdownItem[];
  labels: Readonly<Record<string, string>>;
  centerValue: number;
  centerLabel: string;
  colorOf?: BreakdownColorOf;
  className?: string;
}

/**
 * Donut (trái, cỡ cố định) + chú giải (phải, giãn hết chỗ còn lại) — cụm dùng ở panel Tài khoản và Cuộc gọi & tin nhắn.
 * Donut `size-24` (6rem) chứ không to hơn: ở panel hẹp nhất (3 cột của `xl`, ~290px) chú giải còn ~170px cho chấm + nhãn + số + %;
 * donut to hơn là nhãn "Đang hoạt động" bị cắt cụt.
 */
const BreakdownDonutLegend = memo(function BreakdownDonutLegend({
  items,
  labels,
  centerValue,
  centerLabel,
  colorOf,
  className,
}: BreakdownDonutLegendProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <BreakdownDonutChart
        centerLabel={centerLabel}
        centerValue={centerValue}
        className="size-24"
        colorOf={colorOf}
        items={items}
        labels={labels}
      />
      <BreakdownLegend className="flex-1" colorOf={colorOf} items={items} labels={labels} />
    </div>
  );
});

export default BreakdownDonutLegend;
