import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';

import { GANTT_RANGES, type GanttRangeKey } from '../../constants/critical-path.constants';

export interface GanttToolbarProps {
  /** Đang xem biểu đồ (tablet) hay danh sách. */
  chartShown: boolean;
  rangeKey: GanttRangeKey;
  /** Chỉ tablet mới có biểu đồ để chuyển qua lại; điện thoại luôn là danh sách. */
  tablet: boolean;
  onRange: (key: GanttRangeKey) => void;
  onToggleView: () => void;
}

/**
 * Thanh công cụ của Gantt (app.md §3): bộ chọn khoảng (2 tuần / Tháng / Quý — chọn MỘT nên `role="radio"`) và, trên
 * tablet, nút chuyển "Xem dạng danh sách" ↔ "Xem biểu đồ". Danh sách là đường thay thế cho biểu đồ (mũi tên chỉ là
 * trang trí, §7) nên nút luôn ở đây chứ không chôn trong menu.
 */
export function GanttToolbar({ chartShown, rangeKey, tablet, onRange, onToggleView }: GanttToolbarProps) {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-xs px-md pb-xs">
      <View accessibilityRole="radiogroup" className="flex-row items-center gap-xs">
        {GANTT_RANGES.map((range) => (
          <Chip
            key={range.key}
            label={range.label}
            role="radio"
            selected={rangeKey === range.key}
            size="sm"
            onPress={() => onRange(range.key)}
          />
        ))}
      </View>
      {tablet ? (
        <Button
          iconLeft={chartShown ? 'document' : 'chart-1'}
          label={chartShown ? 'Xem dạng danh sách' : 'Xem biểu đồ'}
          size="sm"
          variant="secondary"
          onPress={onToggleView}
        />
      ) : null}
    </View>
  );
}
