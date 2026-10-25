import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';

import type { ContributionReport } from '../api/contribution.types';
import { formatPoints } from '../utils/contribution-format';

interface Stat {
  icon: IconName;
  label: string;
  tone: IconTileTone;
  value: string;
}

/**
 * Ba con số nhìn nhanh của kỳ đang xem: thẻ đã hoàn thành · điểm thẻ đã xong · số thành viên có trong báo cáo. Đọc từ
 * `report.totals` + `members` (đã có trong `GET …/contribution`, trước đây không hiện) — không gọi thêm API.
 *
 * Mỗi thẻ = ô icon `sm` + giá trị `text-header-sm` + nhãn `text-caption-sm`, và là MỘT ô trợ năng ("Thẻ hoàn thành, 12") —
 * tách rời thì trình đọc màn hình đọc con số trước, nhãn sau. ⚠️ Chỉ là tóm tắt: không thay bảng điểm, không có gì bấm được.
 */
export function ContributionStats({ report }: { report: ContributionReport }) {
  const stats: Stat[] = [
    {
      icon: 'checkmark-circle',
      label: 'Thẻ hoàn thành',
      tone: 'success',
      value: String(report.totals.tasksDone),
    },
    {
      icon: 'star',
      label: 'Điểm thẻ đã xong',
      tone: 'warning',
      value: formatPoints(report.totals.storyPointsDone),
    },
    { icon: 'add-team', label: 'Thành viên', tone: 'info', value: String(report.members.length) },
  ];

  return (
    <View className="flex-row gap-sm">
      {stats.map((stat) => (
        <View
          key={stat.label}
          accessibilityLabel={`${stat.label}, ${stat.value}`}
          accessible
          className="flex-1"
        >
          {/* `flex-1`: thẻ giãn theo ô cao nhất của hàng khi nhãn xuống hai dòng — ba thẻ luôn bằng nhau. */}
          <Card className="flex-1 gap-xs">
            <IconTile name={stat.icon} size="sm" tone={stat.tone} />
            <Text className="text-header-sm font-bold text-fg-1">{stat.value}</Text>
            <Text className="text-caption-sm text-fg-2" numberOfLines={2}>
              {stat.label}
            </Text>
          </Card>
        </View>
      ))}
    </View>
  );
}
