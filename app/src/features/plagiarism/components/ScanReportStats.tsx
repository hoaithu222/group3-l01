import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';

import type { ScanResult } from '../api/plagiarism.types';

interface Stat {
  icon: IconName;
  label: string;
  tone: IconTileTone;
  value: string;
}

/**
 * Ba con số nhìn nhanh của báo cáo: số tệp đã so · điểm cao nhất · số tệp mức cao. Tính từ `results` đã có (không gọi
 * thêm API). Mỗi thẻ = ô icon `sm` + giá trị `text-header-sm` + nhãn `text-caption-sm` — khuôn thẻ thống kê chung của app.
 *
 * ⚠️ Mỗi thẻ là MỘT ô trợ năng ("Điểm cao nhất, 45%"): tách rời thì trình đọc màn hình đọc con số trước, nhãn sau.
 */
export function ScanReportStats({ results }: { results: readonly ScanResult[] }) {
  const compared = results.filter((r) => r.status === 'OK');
  const topScore = compared.reduce((max, r) => Math.max(max, r.score), 0);
  const highCount = compared.filter((r) => r.level === 'HIGH').length;
  const stats: Stat[] = [
    { icon: 'document', label: 'Tệp đã so', tone: 'info', value: String(compared.length) },
    { icon: 'analytics-02', label: 'Điểm cao nhất', tone: 'brand', value: `${topScore}%` },
    { icon: 'alert-warning', label: 'Tệp mức cao', tone: 'warning', value: String(highCount) },
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
