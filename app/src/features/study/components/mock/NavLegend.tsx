import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';

import type { NavSummary } from '../../utils/mock-nav-utils';

function LegendItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-2xs">
      {children}
      <Text className="text-caption-lg text-fg-2">{label}</Text>
    </View>
  );
}

/**
 * Chú giải của lưới câu: mẫu hình + CHỮ + số đếm cho từng trạng thái (màu một mình không đủ). Chỉ để nhìn — mỗi ô đã có
 * nhãn trợ năng đọc đủ trạng thái, nên chú giải bị ẩn khỏi trình đọc màn hình để khỏi đọc lặp.
 */
export function NavLegend({ summary }: { summary: NavSummary }) {
  return (
    <View
      accessibilityElementsHidden
      className="flex-row flex-wrap gap-x-sm gap-y-2xs"
      importantForAccessibility="no-hide-descendants"
    >
      <LegendItem label={`Đã làm ${summary.answered}`}>
        <View className="size-4 rounded-3xs border-medium border-solid border-border-info-subtle bg-surface-info" />
      </LegendItem>
      <LegendItem label={`Bỏ trống ${summary.blank}`}>
        <View className="size-4 rounded-3xs border-medium border-dashed border-border-2 bg-bg-1" />
      </LegendItem>
      <LegendItem label="Đang xem">
        <View className="size-4 rounded-3xs border-thick border-solid border-border-info bg-bg-1" />
      </LegendItem>
      {summary.flagged > 0 ? (
        <LegendItem label={`Đánh dấu ${summary.flagged}`}>
          <Icon color="warning" name="star" size={14} variant="solid" />
        </LegendItem>
      ) : null}
      {summary.pending > 0 ? (
        <LegendItem label={`Chưa đồng bộ ${summary.pending}`}>
          <Badge dot variant="warning" />
        </LegendItem>
      ) : null}
    </View>
  );
}
