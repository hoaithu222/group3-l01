import { Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { MEDALS } from '../constants/live-quiz-visuals';

export interface RankMedalProps {
  rank: number;
  size?: 'lg' | 'md' | 'sm';
}

/** Khung tròn (`size-*` = cạnh dp theo thang giãn cách). ⚠️ Cỡ CHỮ ở bảng riêng dưới: `<Text>` KHÔNG thừa kế cỡ chữ từ `<View>` cha. */
const BOX = { lg: 'size-14', md: 'size-10', sm: 'size-8' } as const;
const DIGIT = { lg: 'text-header-sm', md: 'text-label-lg', sm: 'text-label-md' } as const;

/**
 * Huy chương hạng: hạng 1–3 vàng · bạc · đồng, từ hạng 4 là ô trung tính. LUÔN có CON SỐ trên huy chương (màu chỉ để đẹp, không
 * mang nghĩa một mình). Ẩn khỏi trình đọc màn hình — dòng/cột chứa nó đã đọc "Hạng n" ở nhãn chung (khỏi đọc hai lần).
 */
export function RankMedal({ rank, size = 'md' }: RankMedalProps) {
  const medal = rank >= 1 && rank <= 3 ? MEDALS[rank as 1 | 2 | 3] : null;

  return (
    <View
      accessibilityElementsHidden
      className={cn(
        'items-center justify-center rounded-full',
        BOX[size],
        medal ? medal.fill : 'bg-surface-neutral',
      )}
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        className={cn('font-bold', DIGIT[size], medal ? medal.ink : 'text-fg-1')}
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
      >
        {String(rank)}
      </Text>
    </View>
  );
}
