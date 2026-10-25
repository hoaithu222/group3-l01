import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { Icon } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

const bar = tv(
  {
    slots: {
      root: 'flex-row items-center gap-sm rounded-md border-hairline px-md py-sm',
      title: 'text-label-lg font-semibold text-fg-1',
      detail: 'text-caption-lg text-fg-2',
    },
    variants: {
      // Cặp `surface-*` + viền `-subtle` cùng họ; chữ `fg-1`/`fg-2` (≥ 4.9:1 trên mọi `surface-*` ở cả hai chế độ).
      tone: {
        correct: { root: 'border-border-success-subtle bg-surface-success' },
        wrong: { root: 'border-border-error-subtle bg-surface-error' },
      },
    },
  },
  { twMergeConfig },
);

export interface QuizFeedbackBarProps {
  /** Đáp án đúng bằng chữ — chỉ hiện khi trả lời SAI. */
  answer: string;
  correct: boolean;
  /** Câu nhiều đáp án: 0..1, `> 0` ⇒ "Đúng một phần" (vẫn là SAI — xem `QuickGrade.partial`). */
  partial?: number;
  /** Số câu đúng liên tiếp tính cả câu này. */
  streak: number;
}

/**
 * Phản hồi TỨC THÌ ngay khi chấm: icon + chữ + màu (màu không phải kênh duy nhất). Đúng → "Chính xác!" (+ chuỗi từ 2 câu đúng liền trở lên); sai →
 * "Chưa đúng" (hoặc "Đúng một phần") kèm đáp án đúng. Là vùng `polite` mang nhãn "Đúng."/"Sai." để trình đọc màn hình đọc ngay khi hiện.
 * Nằm TRONG thanh đáy dính (`QuizFooter`) — luôn thấy được dù câu dài phải cuộn, đúng chỗ ngón tay đang ở (gần nút "Câu tiếp").
 */
export function QuizFeedbackBar({ answer, correct, partial = 0, streak }: QuizFeedbackBarProps) {
  const styles = bar({ tone: correct ? 'correct' : 'wrong' });
  const streakText = correct && streak >= 2 ? `Chuỗi ${streak} câu đúng liên tiếp` : null;
  const detail = correct ? streakText : `Đáp án đúng: ${answer}`;
  const title = correct ? 'Chính xác!' : partial > 0 ? 'Đúng một phần' : 'Chưa đúng';

  return (
    <View
      accessibilityLabel={`${correct ? 'Đúng' : 'Sai'}. ${detail ?? ''}`.trim()}
      accessibilityLiveRegion="polite"
      accessible
      className={styles.root()}
    >
      <Icon
        color={correct ? 'success' : 'error'}
        name={correct ? 'checkmark-circle' : 'clear-circle'}
        size={28}
        variant="solid"
      />
      <View className="flex-1">
        <Text className={styles.title()}>{title}</Text>
        {detail ? (
          <Text className={styles.detail()} numberOfLines={3}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
