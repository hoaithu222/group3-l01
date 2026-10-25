import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import type { MockAttemptDto } from '../../api/mock-attempts.types';
import { scoreBreakdown, type ScoreBreakdown as Breakdown } from '../../utils/mock-score-utils';

const tile = tv(
  {
    slots: {
      root: 'flex-1 items-center gap-3xs rounded-sm px-xs py-sm',
      count: 'text-header-sm font-bold text-fg-1',
      label: 'text-label-md text-fg-2',
    },
    variants: {
      kind: {
        correct: { root: 'bg-surface-success' },
        wrong: { root: 'bg-surface-error' },
        blank: { root: 'bg-surface-neutral' },
      },
    },
  },
  { twMergeConfig },
);

/** Mỗi loại một icon KHÁC HÌNH + một nhãn chữ — màu chỉ là lớp phụ. */
const KINDS: readonly {
  color: ThemeColorKey;
  icon: IconName;
  key: keyof Breakdown;
  kind: 'blank' | 'correct' | 'wrong';
  label: string;
}[] = [
  { color: 'success', icon: 'checkmark-circle', key: 'correct', kind: 'correct', label: 'Đúng' },
  { color: 'error', icon: 'clear-circle', key: 'wrong', kind: 'wrong', label: 'Sai' },
  { color: 'fg-2', icon: 'minus', key: 'unanswered', kind: 'blank', label: 'Bỏ trống' },
];

/** Phân rã Đúng / Sai / Bỏ trống của một lượt (cộng lại đúng `total` câu). */
export function ScoreBreakdown({ attempt }: { attempt: MockAttemptDto }) {
  const counts = scoreBreakdown(attempt);
  return (
    <View className="w-full flex-row gap-xs">
      {KINDS.map(({ color, icon, key, kind, label }) => {
        const styles = tile({ kind });
        return (
          <View
            key={key}
            accessibilityLabel={`${label} ${counts[key]} câu`}
            accessible
            className={styles.root()}
          >
            <Icon color={color} name={icon} size={20} />
            <Text className={styles.count()} maxFontSizeMultiplier={1.3}>
              {String(counts[key])}
            </Text>
            <Text className={styles.label()} maxFontSizeMultiplier={1.3}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
