import { Text, View } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Chip } from '@/shared/ui/chip';
import { Icon, type IconName } from '@/shared/ui/icon';

import type { ReviewCounts } from '../../utils/mock-review-utils';

function CountPill({
  color,
  count,
  icon,
  label,
}: {
  color: ThemeColorKey;
  count: number;
  icon: IconName;
  label: string;
}) {
  return (
    <View
      accessibilityLabel={`${label} ${count} câu`}
      accessible
      className="flex-row items-center gap-3xs rounded-full bg-bg-1 px-sm py-3xs"
    >
      <Icon color={color} name={icon} size={16} variant="solid" />
      <Text className="text-label-md font-semibold text-fg-1">{`${label} ${count}`}</Text>
    </View>
  );
}

export interface ReviewSummaryBarProps {
  counts: ReviewCounts;
  /** Số câu đang hiện / tổng số câu của lượt. */
  shown: number;
  total: number;
  wrongOnly: boolean;
  onToggleWrongOnly: () => void;
}

/**
 * Đầu màn xem lại: đếm Đúng / Sai / Bỏ trống của cả lượt (icon + chữ + số), rồi chip lọc "Chỉ câu sai" (gồm cả câu bỏ
 * trống — mọi câu chưa đúng) và số câu đang hiện.
 */
export function ReviewSummaryBar({
  counts,
  onToggleWrongOnly,
  shown,
  total,
  wrongOnly,
}: ReviewSummaryBarProps) {
  return (
    <View className="gap-xs px-md">
      <View className="flex-row flex-wrap gap-xs">
        <CountPill color="success" count={counts.correct} icon="checkmark-circle" label="Đúng" />
        <CountPill color="error" count={counts.wrong} icon="clear-circle" label="Sai" />
        <CountPill color="fg-2" count={counts.blank} icon="minus" label="Bỏ trống" />
      </View>
      <View className="flex-row items-center justify-between gap-sm">
        <Chip
          label="Chỉ câu sai"
          role="checkbox"
          selected={wrongOnly}
          onPress={onToggleWrongOnly}
        />
        <Text className="text-label-md text-fg-2">{`${shown}/${total} câu`}</Text>
      </View>
    </View>
  );
}
