import { Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { HEAT_CLASSES } from '../constants/contribution.constants';
import type { HeatLevel } from '../utils/heatmap-grid';

const LEVELS: readonly HeatLevel[] = [0, 1, 2, 3, 4];

/** Chú giải "Ít → Nhiều" bằng CHỮ + năm ô mẫu (app.md §7: màu không phải tín hiệu duy nhất). Ô mẫu chỉ trang trí nên ẩn khỏi trình đọc màn hình. */
export function HeatmapLegend() {
  return (
    <View accessibilityLabel="Chú giải: từ ít hoạt động tới nhiều hoạt động" accessible className="flex-row items-center gap-xs">
      <Text className="text-caption-sm text-fg-2">Ít</Text>
      <View accessibilityElementsHidden className="flex-row gap-3xs" importantForAccessibility="no-hide-descendants">
        {LEVELS.map((level) => (
          <View key={level} className={cn('h-3 w-3 rounded-3xs', HEAT_CLASSES[level])} />
        ))}
      </View>
      <Text className="text-caption-sm text-fg-2">Nhiều</Text>
    </View>
  );
}
