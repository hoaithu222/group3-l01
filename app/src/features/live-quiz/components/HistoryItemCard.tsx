import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { formatDate } from '@/shared/utils/format/date.utils';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { LiveQuizHistoryItemDto } from '../api/live-quiz.types';
import { GrowBar } from './GrowBar';
import { RankMedal } from './RankMedal';

interface HistoryItemCardProps {
  item: LiveQuizHistoryItemDto;
  onPress: () => void;
}

/**
 * Một lượt thi trong lịch sử: tiêu đề = tên bộ (mang vai `button` — `Card onPress` + `title` chuỗi), thân là huy chương hạng +
 * điểm + "Đúng x/y câu · ngày" + thanh tỉ lệ đúng. Nhãn trợ năng đọc "Hạng 3" thay vì "thăng 3" (ký hiệu `#`/huy chương không
 * đọc lên được). Thanh tỉ lệ chỉ là hình — con số đã nằm ở chữ đứng cạnh.
 */
export function HistoryItemCard({ item, onPress }: HistoryItemCardProps) {
  const score = formatNumber(item.score, { unit: 'điểm' });
  const percent = item.total > 0 ? (item.correct / item.total) * 100 : 0;
  const date = formatDate(item.endedAt ?? item.createdAt);

  return (
    <Card title={item.setTitle} onPress={onPress}>
      <View
        accessibilityLabel={`Hạng ${String(item.rank)}, ${score}, đúng ${String(item.correct)} trên ${String(item.total)} câu`}
        accessible
        className="gap-sm"
      >
        <View className="flex-row items-center gap-sm">
          <RankMedal rank={item.rank} size="md" />
          <View className="flex-1 gap-3xs">
            <Text className="text-label-lg text-fg-1">{score}</Text>
            <Text className="text-caption-lg text-fg-2">
              {`Đúng ${String(item.correct)}/${String(item.total)} câu${date ? ` · ${date}` : ''}`}
            </Text>
          </View>
          <Icon color="fg-2" name="arrow-right-small" size="sm" />
        </View>
        <GrowBar fillClassName="bg-action-success" percent={percent} />
      </View>
    </Card>
  );
}
