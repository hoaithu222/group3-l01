import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';

import type { MockTagScore } from '../../api/mock-attempts.types';
import { tagLabel, tagPercent } from '../../utils/mock-result-utils';
import { WEAK_TAG_PCT, weakTags } from '../../utils/mock-score-utils';

/**
 * Khối "Chủ đề nên ôn lại": nêu TÊN + điểm các chủ đề yếu nhất (dưới 60%, tối đa 3), hoặc báo không có chủ đề yếu. Chỉ
 * đọc dữ liệu `byTag` của chính lượt này — không suy đoán thêm.
 */
export function WeakTopics({ scores }: { scores: readonly MockTagScore[] }) {
  const weak = weakTags(scores);
  const hasWeak = weak.length > 0;
  return (
    <Card>
      <View className="flex-row items-center gap-sm">
        <IconTile
          name={hasWeak ? 'alert-information' : 'checkmark-circle'}
          size="md"
          tone={hasWeak ? 'warning' : 'success'}
        />
        <View className="flex-1 gap-3xs">
          <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
            {hasWeak ? 'Chủ đề nên ôn lại' : 'Không có chủ đề yếu'}
          </Text>
          <Text className="text-body-md text-fg-2">
            {hasWeak
              ? weak.map((s) => `${tagLabel(s.tag)} · ${tagPercent(s)}%`).join(', ')
              : `Bạn nắm khá đều các chủ đề (từ ${WEAK_TAG_PCT}% trở lên).`}
          </Text>
        </View>
      </View>
    </Card>
  );
}
