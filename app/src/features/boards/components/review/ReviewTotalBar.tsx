import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { formatScore, type ScorePreview } from '../../utils/review-score';

export interface ReviewTotalBarProps {
  preview: ScorePreview;
  /** Lượt không có rubric: người chấm cho thẳng điểm 0–10, không có "tiêu chí". */
  freeScore: boolean;
}

/**
 * Tổng quy đổi thang 10 cập nhật khi nhập (p4-05 app.md §2 `ReviewTotalBar`): "Tổng 8,0/10". Chưa đủ ô thì nói còn thiếu bao nhiêu
 * (không bịa số nửa vời). Đọc được bằng trình đọc màn hình ("Tổng 8 trên 10") — nhãn riêng vì "8,0/10" bị đọc là ngày/phân số.
 * `accessibilityLiveRegion`: điểm đổi theo từng lần bấm nên trình đọc màn hình xướng lại tổng mới.
 */
export function ReviewTotalBar({ preview, freeScore }: ReviewTotalBarProps) {
  const complete = preview.score10 !== null;
  const remaining = preview.total - preview.filled;
  const spoken = complete
    ? `Tổng ${String(preview.score10).replace('.', ',')} trên 10`
    : freeScore
      ? 'Chưa nhập điểm'
      : `Còn ${remaining} tiêu chí chưa chấm`;

  return (
    <View
      accessibilityLabel={spoken}
      accessibilityLiveRegion="polite"
      accessible
      className="flex-row items-center justify-between gap-sm rounded-sm border-hairline border-border-1 bg-surface-neutral p-md"
    >
      <View className="flex-row items-center gap-xs">
        <Icon color={complete ? 'success' : 'fg-2'} name={complete ? 'checkmark-circle' : 'timer'} />
        <Text className="text-label-lg font-semibold text-fg-1">Tổng điểm</Text>
      </View>
      {complete ? (
        <Text className="text-header-sm font-semibold text-fg-1">{`${formatScore(preview.score10 as number)}/10`}</Text>
      ) : (
        <Text className="shrink text-right text-body-md text-fg-2">
          {freeScore ? 'Chưa nhập điểm' : `Còn ${remaining}/${preview.total} tiêu chí`}
        </Text>
      )}
    </View>
  );
}
