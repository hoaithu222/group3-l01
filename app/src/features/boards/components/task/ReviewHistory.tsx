import { useState } from 'react';
import { View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';

import type { ReviewRoundDto } from '../../api/reviews.types';
import { ReviewRoundCard } from './ReviewRoundCard';

/**
 * Lịch sử các lượt chấm CŨ (mới → cũ), gập sẵn: thẻ Yêu cầu sửa rồi chấm lại có thể có vài lượt, và điểm/nhận xét từng lượt đã lọc theo
 * người xem (BE). Không có lượt cũ → không vẽ gì.
 */
export function ReviewHistory({ rounds }: { rounds: readonly ReviewRoundDto[] }) {
  const [expanded, setExpanded] = useState(false);
  if (rounds.length === 0) return null;

  return (
    <View className="gap-sm">
      <View className="flex-row">
        <LinkButton
          accessibilityLabel={expanded ? 'Ẩn lịch sử chấm' : `Xem lịch sử chấm, ${rounds.length} lượt`}
          iconRight={expanded ? 'arrow-up-small' : 'arrow-down-small'}
          label={expanded ? 'Ẩn lịch sử chấm' : `Lịch sử chấm (${rounds.length} lượt)`}
          onPress={() => setExpanded((value) => !value)}
        />
      </View>
      {expanded ? rounds.map((round) => <ReviewRoundCard key={round.id} round={round} />) : null}
    </View>
  );
}
