import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { AnimatedNumber } from '@/shared/ui/motion';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { AchievementStat } from '../../utils/achievement-stats';

/**
 * Một ô của lưới "Thành tích" — CÙNG khuôn với thẻ thống kê Trang chủ (`HomeStatCard`): nhãn `label-md` + `IconTile sm`
 * góc phải, con số `header-md` đậm đếm lên, cùng đệm `p-md`. `flex-1 w-auto` để hai ô chia đều một hàng (`Card` mặc định
 * `w-full`). Nội dung gói trong MỘT ô trợ năng để TalkBack đọc "Việc hoàn thành: 128" một lượt thay vì "128" rồi mới tới nhãn.
 */
export function HomeStatTile({ stat }: { stat: AchievementStat }) {
  return (
    <Card className="w-auto flex-1 gap-0">
      <View
        accessibilityLabel={`${stat.label}: ${formatNumber(stat.value)}`}
        accessible
        className="gap-2xs"
      >
        <View className="flex-row items-center gap-sm">
          <Text className="flex-1 text-label-md text-fg-2" numberOfLines={2}>
            {stat.label}
          </Text>
          <IconTile name={stat.icon} size="sm" tone={stat.tone} />
        </View>
        <AnimatedNumber className="text-header-md font-bold text-fg-1" value={stat.value} />
      </View>
    </Card>
  );
}
