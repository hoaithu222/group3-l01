import { Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { answerLook } from '../utils/answer-identity';
import { AnswerShape } from './AnswerShape';

export interface AnswerBadgeProps {
  index: number;
  size?: 'md' | 'sm';
}

/**
 * Nhãn nhỏ "hình + chữ cái" của đáp án (dòng công bố, danh sách của chủ phòng) — cùng bộ nhận diện với ô đáp án lớn nên người
 * chơi dò được đáp án mình chọn ở màn công bố bằng hình/chữ, không cần nhớ màu. Ẩn khỏi trình đọc màn hình: nơi dùng đã đọc
 * "A. nội dung" ở nhãn của cả dòng.
 */
export function AnswerBadge({ index, size = 'md' }: AnswerBadgeProps) {
  const look = answerLook(index);
  const large = size === 'md';

  return (
    <View
      accessibilityElementsHidden
      className={cn(
        'flex-row items-center justify-center gap-3xs rounded-xs',
        look.fill,
        large ? 'h-9 min-w-14 px-xs' : 'h-7 min-w-11 px-2xs',
      )}
      importantForAccessibility="no-hide-descendants"
    >
      <AnswerShape color={look.inkToken} shape={look.shape} size={large ? 16 : 12} />
      <Text
        className={cn('font-bold', look.ink, large ? 'text-label-lg' : 'text-label-md')}
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
      >
        {look.letter}
      </Text>
    </View>
  );
}
