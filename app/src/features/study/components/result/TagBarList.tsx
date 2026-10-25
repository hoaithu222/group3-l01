import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { Badge } from '@/shared/ui/badge';
import { twMergeConfig } from '@/shared/utils/style/cn';

import type { MockTagScore } from '../../api/mock-attempts.types';
import { tagLabel, tagPercent } from '../../utils/mock-result-utils';
import { tagStrength } from '../../utils/mock-score-utils';

/** Thanh theo MỨC (vững / vừa / yếu): xanh lá · xanh dương · đỏ — và chủ đề yếu có thêm nhãn chữ "Cần ôn". */
const bar = tv(
  {
    base: 'h-2 rounded-full',
    variants: {
      strength: { strong: 'bg-action-success', medium: 'bg-action-info', weak: 'bg-action-error' },
    },
  },
  { twMergeConfig },
);

/**
 * Điểm theo chủ đề dạng thanh (app.md p4-02 §2 `TagBarList`) — dùng khi < 3 thẻ (radar suy biến) và LUÔN đi cùng radar:
 * số `đúng/tổng · %` bằng chữ là nguồn thông tin đầy đủ, hình chỉ là phụ. Chủ đề yếu (< 60%) có huy hiệu chữ "Cần ôn" —
 * màu thanh không phải kênh duy nhất.
 */
export function TagBarList({ scores }: { scores: readonly MockTagScore[] }) {
  return (
    <View className="gap-md">
      {scores.map((score) => {
        const pct = tagPercent(score);
        const strength = tagStrength(pct);
        return (
          <View
            key={score.tag}
            accessibilityLabel={`${tagLabel(score.tag)}: đúng ${score.correct}/${score.total}, ${pct} phần trăm`}
            accessible
            className="gap-xs"
          >
            <View className="flex-row items-center justify-between gap-sm">
              <Text className="flex-1 text-body-md font-semibold text-fg-1">
                {tagLabel(score.tag)}
              </Text>
              {strength === 'weak' ? <Badge label="Cần ôn" size="sm" variant="error" /> : null}
              <Text className="text-body-md text-fg-2">{`${score.correct}/${score.total} · ${pct}%`}</Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-border-1">
              <View className={bar({ strength })} style={{ width: `${pct}%` }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
