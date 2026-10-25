import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { HERO_SURFACE } from '../constants/live-quiz-visuals';
import { formatQuizDuration } from '../utils/quiz-duration';

interface SetupSummaryProps {
  count: number;
  seconds: number;
}

/**
 * Dòng tóm tắt thời lượng dự kiến của phiên ("khoảng 3 phút 20 giây") = số câu × giây mỗi câu. ⚠️ Chưa tính thời gian xem đáp án
 * giữa các câu (do chủ phòng bấm) nên gọi là "ít nhất" — số này là cận dưới thật, không phải ước lượng bịa. Đổi số câu/giây thì
 * dòng đổi theo và được đọc `polite`.
 */
export function SetupSummary({ count, seconds }: SetupSummaryProps) {
  return (
    <View className={cn('flex-row items-center gap-sm rounded-md p-md', HERO_SURFACE)}>
      <Icon color="warning" name="timer" size="md" variant="twotone" />
      <View className="flex-1 gap-3xs">
        <Text accessibilityLiveRegion="polite" className="text-label-lg text-fg-1">
          {`Ít nhất ${formatQuizDuration(count * seconds)}`}
        </Text>
        <Text className="text-caption-lg text-fg-2">
          {`${String(count)} câu × ${String(seconds)} giây, chưa gồm thời gian xem đáp án.`}
        </Text>
      </View>
    </View>
  );
}
