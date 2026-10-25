import { Text, View } from 'react-native';

import { formatNumber } from '@/shared/utils/format/currency.utils';
import { cn } from '@/shared/utils/style/cn';

import type { RankedEntry } from '../utils/ranked-entries';
import { DecorAvatar } from './DecorAvatar';
import { MotionView } from './MotionView';
import { RankMedal } from './RankMedal';

export interface RankRowProps {
  entry: RankedEntry;
  /** Dòng của CHÍNH tôi — nền nổi, chữ đậm, hậu tố "(bạn)". */
  me?: boolean;
}

/**
 * Một dòng bảng xếp hạng: huy chương hạng · avatar chữ viết tắt · tên (+ dòng phụ) · điểm. Có `key` ổn định theo `userId` nên khi
 * thứ hạng đổi dòng TRƯỢT tới chỗ mới (`layout` của Reanimated, luồng UI; "Giảm chuyển động" ⇒ đổi chỗ ngay). Cả dòng là MỘT ô trợ
 * năng đọc trọn ("Hạng 2, Minh Anh, 1.250 điểm").
 */
export function RankRow({ entry, me = false }: RankRowProps) {
  const score = formatNumber(entry.score);
  const speech = `Hạng ${String(entry.rank)}, ${entry.name}${me ? ' (bạn)' : ''}, ${score} điểm`;

  return (
    <MotionView layout>
      <View
        accessibilityLabel={speech}
        accessible
        className={cn(
          'min-h-12 flex-row items-center gap-sm rounded-md border-hairline px-sm py-xs',
          me ? 'border-border-warning-subtle bg-surface-warning' : 'border-transparent',
        )}
      >
        <RankMedal rank={entry.rank} size="sm" />
        <DecorAvatar name={entry.name} size="sm" />
        <View className="flex-1">
          <Text className={cn('text-body-md text-fg-1', me && 'font-semibold')} numberOfLines={1}>
            {me ? `${entry.name} (bạn)` : entry.name}
          </Text>
          {entry.caption ? (
            <Text className="text-caption-sm text-fg-2">{entry.caption}</Text>
          ) : null}
        </View>
        <Text className="text-label-lg text-fg-1">{score}</Text>
      </View>
    </MotionView>
  );
}
