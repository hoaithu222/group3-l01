import { Fragment, memo, useMemo, useState } from 'react';

import { EmptyState } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import type { InsightsHeatmap } from '@/core/api/admin';
import {
  HEAT_LEGEND_LEVELS,
  HEAT_LEVEL_CLASS,
  HEATMAP_DAY_INDEXES,
  HEATMAP_HOUR_INDEXES,
  HEATMAP_HOUR_LABEL_STEP,
  WEEKDAY_SHORT,
} from '../constants/heatmap.constants';
import {
  cellValue,
  formatHeatCell,
  formatPeakWhen,
  heatLevel,
  peakCell,
} from '../utils/heatmap.utils';

export interface ActivityHeatmapProps {
  heatmap: InsightsHeatmap;
}

/**
 * Bản đồ nhiệt hoạt động: 7 hàng (thứ) × 24 cột (giờ), thang 5 mức một hue (`HEAT_LEVEL_CLASS`), ô 0 = nền trung tính. Dựng bằng CSS grid
 * (ô lấp đều chiều cao panel, không cần recharts — heatmap không có trục số/tooltip chuẩn của biểu đồ đường/cột).
 *
 * Đọc được KHÔNG cần chuột và KHÔNG cần nhìn màu: dòng tóm tắt phía trên nói thẳng cao điểm ("Cao điểm: Thứ Ba lúc 14h · 1.234 tin"), cả lưới là
 * một `role="img"` mang cùng câu đó. Rê chuột (hoặc chạm) vào ô → dòng chi tiết phía dưới ("Thứ Ba · 14:00–15:00 · 1.234 tin") + ô được viền sáng.
 * Một dòng chi tiết dùng chung thay vì 168 tooltip: mỗi ô một Radix Tooltip là 168 cây con + 168 lần đo vị trí chỉ để hiện một câu chữ.
 *
 * Thang màu chia theo ô đông nhất TÍNH LẠI từ `cells` (`peakCell`), không tin `heatmap.max`. Chưa có tin nào → trạng thái rỗng, không vẽ lưới
 * toàn ô xám (nhìn như "ngày nào cũng 0 giờ nào cũng 0" thay vì "chưa có dữ liệu").
 */
const ActivityHeatmap = memo(function ActivityHeatmap({ heatmap }: ActivityHeatmapProps) {
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);
  const peak = useMemo(() => peakCell(heatmap), [heatmap]);

  if (!peak) {
    return (
      <EmptyState
        description="Chưa có tin nhắn nào trong kỳ này."
        icon="chart-simple-bold"
        size="sm"
        title="Chưa có dữ liệu"
      />
    );
  }

  const peakText = `Cao điểm: ${formatPeakWhen(peak)} · ${formatNumber(peak.value)} tin`;
  const detail = active
    ? formatHeatCell(active.day, active.hour, cellValue(heatmap.cells, active.day, active.hour))
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <p className="shrink-0 truncate text-caption-12 text-fg-3" title={peakText}>
        Cao điểm:{' '}
        <span className="text-caption-12-semibold text-fg-1">{formatPeakWhen(peak)}</span>
        <span className="text-fg-4"> · {formatNumber(peak.value)} tin</span>
      </p>

      <div
        aria-label={`Bản đồ nhiệt tin nhắn theo thứ và giờ trong tuần, giờ Việt Nam. ${peakText}.`}
        className="grid min-h-0 flex-1 grid-cols-[auto_repeat(24,minmax(0,1fr))] grid-rows-[repeat(7,minmax(0,1fr))_auto] gap-0.5"
        role="img"
        onPointerLeave={() => setActive(null)}
      >
        {HEATMAP_DAY_INDEXES.map((day) => (
          <Fragment key={day}>
            <span className="flex items-center pr-1 text-caption-12 text-fg-4">
              {WEEKDAY_SHORT[day]}
            </span>
            {HEATMAP_HOUR_INDEXES.map((hour) => (
              <div
                key={hour}
                className={cn(
                  'rounded-xs',
                  HEAT_LEVEL_CLASS[heatLevel(cellValue(heatmap.cells, day, hour), peak.value)],
                  active?.day === day && active.hour === hour && 'ring-1 ring-inset ring-fg-1',
                )}
                onPointerEnter={() => setActive({ day, hour })}
              />
            ))}
          </Fragment>
        ))}
        {/* Hàng nhãn giờ: nhãn tràn khỏi ô của nó (ô chỉ rộng ~1 chữ số) — nên chỉ ghi mỗi 3 giờ. */}
        <span />
        {HEATMAP_HOUR_INDEXES.map((hour) => (
          <span key={hour} className="whitespace-nowrap text-caption-12 tabular-nums text-fg-4">
            {hour % HEATMAP_HOUR_LABEL_STEP === 0 ? hour : ''}
          </span>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 text-caption-12">
        <span className="min-w-0 truncate tabular-nums text-fg-2">
          {detail ?? <span className="text-fg-4">Rê chuột vào một ô để xem số tin</span>}
        </span>
        <span aria-hidden className="flex shrink-0 items-center gap-1 text-fg-4">
          Ít
          {HEAT_LEGEND_LEVELS.map((level) => (
            <span key={level} className={cn('size-2.5 rounded-xs', HEAT_LEVEL_CLASS[level])} />
          ))}
          Nhiều
        </span>
      </div>
    </div>
  );
});

export default ActivityHeatmap;
