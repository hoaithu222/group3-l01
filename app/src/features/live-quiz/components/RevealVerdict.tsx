import { Text, View } from 'react-native';

import { Icon, type IconName } from '@/shared/ui/icon';
import type { ThemeColorKey } from '@/shared/theme';
import { cn } from '@/shared/utils/style/cn';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import { MotionView } from './MotionView';
import { PointsPop } from './PointsPop';

export type Verdict = 'correct' | 'none' | 'wrong';

const LOOK: Record<
  Verdict,
  { box: string; icon: IconName; ink: ThemeColorKey; text: string; title: string }
> = {
  correct: {
    box: 'border-border-success-subtle bg-surface-success',
    icon: 'checkmark-circle',
    ink: 'success',
    text: 'text-success',
    title: 'Chính xác!',
  },
  none: {
    box: 'border-border-1 bg-surface-neutral',
    icon: 'clock',
    ink: 'fg-2',
    text: 'text-fg-1',
    title: 'Bạn chưa trả lời',
  },
  wrong: {
    box: 'border-border-error-subtle bg-surface-error',
    icon: 'cancel',
    ink: 'error',
    text: 'text-error',
    title: 'Chưa đúng',
  },
};

export interface RevealVerdictProps {
  verdict: Verdict;
  /** Điểm vừa nhận ở câu này; 0 ⇒ không có dòng "+N" (không bịa số). */
  gain?: number;
  /** Chuỗi câu đúng liên tiếp (≥ 2 mới hiện). */
  streak?: number;
}

/**
 * Kết luận của TÔI ở câu vừa công bố: icon + chữ + màu (đúng/sai/chưa trả lời — không chỉ dùng màu), điểm nhận được nảy vào,
 * và chuỗi đúng liên tiếp nếu máy này đếm được. Cả khối là MỘT ô trợ năng đọc trọn ("Chính xác! Bạn nhận thêm 120 điểm…").
 * `gain`/`streak` chỉ hiện khi ĐÚNG — sai/bỏ trống không có điểm cộng.
 */
export function RevealVerdict({ gain = 0, streak = 0, verdict }: RevealVerdictProps) {
  const look = LOOK[verdict];
  const earned = verdict === 'correct' && gain > 0;
  const chain = verdict === 'correct' && streak >= 2;
  const speech = [
    look.title,
    earned ? `Bạn nhận thêm ${formatNumber(gain)} điểm.` : '',
    chain ? `Chuỗi ${String(streak)} câu đúng liên tiếp.` : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

  return (
    <MotionView enter="zoom">
      <View
        accessibilityLabel={speech}
        accessibilityLiveRegion="polite"
        accessible
        className={cn('flex-row items-center gap-md rounded-md border-hairline p-md', look.box)}
      >
        <Icon color={look.ink} name={look.icon} size="xl" variant="solid" />
        <View className="flex-1 gap-3xs">
          <Text className={cn('text-header-sm font-bold', look.text)}>{look.title}</Text>
          {chain ? (
            <View className="flex-row items-center gap-3xs">
              <Icon color="warning" name="flash" size="xs" variant="twotone" />
              <Text className="text-label-md text-fg-1">{`Chuỗi ${String(streak)} câu đúng liên tiếp`}</Text>
            </View>
          ) : null}
        </View>
        {earned ? <PointsPop points={gain} /> : null}
      </View>
    </MotionView>
  );
}
