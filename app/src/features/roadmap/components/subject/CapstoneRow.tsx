import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

export interface CapstoneRowProps {
  capstone: string;
  /** Mọi buổi bắt buộc của tháng đã xong — dự án đến lượt làm. */
  ready: boolean;
}

/**
 * Nút CUỐI đường thời gian của tháng: "Dự án cuối tháng" (`phase.capstone`) — điểm đích của cả tháng, nên đứng ngay
 * sau buổi cuối thay vì một dòng chữ rời ở đáy màn như bản trước.
 */
export function CapstoneRow({ capstone, ready }: CapstoneRowProps) {
  return (
    <View accessibilityLabel={`Dự án cuối tháng: ${capstone}`} accessible className="flex-row gap-sm">
      <View className="w-8 items-center">
        <View className="size-8 items-center justify-center rounded-full border border-action-accent bg-surface-secondary">
          <Icon color="action-accent" name="star" size="sm" variant="twotone" />
        </View>
      </View>
      <View className="flex-1 gap-2xs rounded-md border border-border-1 bg-surface-secondary p-sm">
        <Text className="text-caption-lg text-fg-2">
          {ready ? 'Dự án cuối tháng · Đến lượt bạn làm' : 'Dự án cuối tháng'}
        </Text>
        <Text className="text-label-md font-semibold text-fg-1">{capstone}</Text>
      </View>
    </View>
  );
}
