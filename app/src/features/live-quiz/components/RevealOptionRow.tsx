import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { answerLook } from '../utils/answer-identity';
import { AnswerBadge } from './AnswerBadge';
import { GrowBar } from './GrowBar';

export interface RevealOptionRowProps {
  correct: boolean;
  count: number;
  index: number;
  /** Đáp án của TÔI ở câu này. */
  mine: boolean;
  /** Tỉ lệ người chọn 0..100. */
  percent: number;
  text: string;
}

/**
 * Một dòng của màn công bố: nhãn hình+chữ cái (đúng bộ nhận diện của ô lúc chọn), nội dung, số người chọn, thanh tỉ lệ.
 * ĐÚNG ⇒ nền xanh + viền + ✓ + thẻ "Đáp án đúng"; đáp án SAI của tôi ⇒ nền đỏ + ✗ + thẻ "Bạn chọn"; còn lại trung tính. Ba kênh
 * (màu, icon, chữ) — không ai phải phân biệt xanh với đỏ. Cả dòng là MỘT ô trợ năng đọc trọn.
 */
export function RevealOptionRow({
  correct,
  count,
  index,
  mine,
  percent,
  text,
}: RevealOptionRowProps) {
  const look = answerLook(index);
  const wrongMine = mine && !correct;
  const speech = [
    `${look.letter}. ${text}`,
    `${String(count)} người chọn`,
    correct ? 'Đáp án đúng' : '',
    mine ? 'Bạn đã chọn' : '',
  ]
    .filter((part) => part !== '')
    .join(', ');

  return (
    <View
      accessibilityLabel={speech}
      accessible
      className={cn(
        'gap-xs rounded-md border-hairline p-sm',
        correct && 'border-border-success-subtle bg-surface-success',
        wrongMine && 'border-border-error-subtle bg-surface-error',
        !correct && !wrongMine && 'border-border-1 bg-bg-1',
      )}
    >
      <View className="flex-row items-center gap-sm">
        <AnswerBadge index={index} size="sm" />
        <Text className={cn('flex-1 text-body-md text-fg-1', correct && 'font-semibold')}>
          {text}
        </Text>
        {correct ? (
          <Icon color="success" name="checkmark-circle" size="md" variant="solid" />
        ) : null}
        {wrongMine ? <Icon color="error" name="cancel" size="md" variant="solid" /> : null}
      </View>
      <GrowBar
        fillClassName={cn(
          correct ? 'bg-action-success' : wrongMine ? 'bg-action-error' : 'bg-fg-2',
        )}
        percent={percent}
      />
      <View className="flex-row flex-wrap items-center justify-between gap-xs">
        <View className="flex-row flex-wrap gap-xs">
          {correct ? <Badge label="Đáp án đúng" size="sm" variant="success" /> : null}
          {mine ? <Badge label="Bạn chọn" size="sm" variant={correct ? 'brand' : 'error'} /> : null}
        </View>
        <Text className="text-label-md text-fg-2">{`${String(count)} người`}</Text>
      </View>
    </View>
  );
}
