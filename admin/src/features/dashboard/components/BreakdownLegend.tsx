import { memo, useMemo } from 'react';

import { tokenVar } from '@/shared/charts';
import { formatNumber } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import type { InsightsBreakdownItem } from '@/core/api/admin';
import {
  buildBreakdownRows,
  formatShare,
  type BreakdownColorOf,
} from '../utils/breakdown.utils';

export interface BreakdownLegendProps {
  items: readonly InsightsBreakdownItem[];
  /** Mã BE → nhãn tiếng Việt (mã lạ hiện nguyên mã). */
  labels: Readonly<Record<string, string>>;
  /** Mặc định tô theo thứ hạng (`seriesTokenAt`) — truyền vào khi màu phải theo mã hoặc theo ngữ nghĩa. */
  colorOf?: BreakdownColorOf;
  /** Vẽ thêm thanh ngang nhỏ dưới mỗi dòng (tỉ lệ trên tổng) — dùng khi legend là biểu đồ duy nhất của nhóm (vai trò). */
  showBar?: boolean;
  className?: string;
}

/**
 * Chú giải dạng danh sách: chấm màu · nhãn · số · %. Là bản CHỮ của donut (donut đặt `role="img"`, không đọc từng lát) nên
 * luôn có mặt cạnh nó — màu không bao giờ đứng một mình (`chart-conventions.md`, quy tắc trợ năng). Mã lạ hiện nguyên mã.
 *
 * Chấm màu là `rounded-full` vì là chấm trạng thái (`tailwind-conventions.md` cho phép). Màu đi qua `style` vì là token DỮ LIỆU
 * (đổi theo từng dòng) — `var(--color-*)` trong style an toàn với Tailwind, khác với class ghép chuỗi.
 */
const BreakdownLegend = memo(function BreakdownLegend({
  items,
  labels,
  colorOf,
  showBar = false,
  className,
}: BreakdownLegendProps) {
  const rows = useMemo(() => buildBreakdownRows(items, labels, { colorOf }), [items, labels, colorOf]);
  if (rows.length === 0) return null;

  return (
    <ul className={cn('flex min-w-0 flex-col gap-1', className)}>
      {rows.map((row) => (
        <li key={row.key} className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5 text-caption-12">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: tokenVar(row.colorToken) }}
            />
            <span className="min-w-0 flex-1 truncate text-fg-2" title={row.label}>
              {row.label}
            </span>
            <span className="shrink-0 text-caption-12-semibold tabular-nums text-fg-1">
              {formatNumber(row.count)}
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums text-fg-4">
              {formatShare(row.percent)}
            </span>
          </div>
          {showBar && (
            <div aria-hidden className="h-1 w-full bg-divider-1">
              <div
                className="h-full"
                style={{ width: `${row.percent}%`, background: tokenVar(row.colorToken) }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
});

export default BreakdownLegend;
