import { Text, View } from 'react-native';

import { useResponsiveValue } from '@/shared/theme';
import { Button } from '@/shared/ui/button';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { CompletionRing } from './CompletionRing';
import { masteryMessage, percentOf } from './study-progress';
import { SummaryStat } from './SummaryStat';

export interface FlashcardSummaryProps {
  known: number;
  total: number;
  unknown: number;
  onBack: () => void;
  onRestart: () => void;
  onRetryUnknown: () => void;
}

/**
 * Kết thúc phiên (app.md p4-01 §3): vòng "đã thuộc n/tổng" vẽ dần + lời nhắn theo mức + ba ô số liệu (Đã thuộc/Chưa thuộc/Bỏ
 * qua) + "Học lại thẻ chưa thuộc" / "Học lại từ đầu". "Ôn theo lịch" (spaced repetition) là p4-02 — chưa có ở đây.
 *
 * `Bỏ qua` = thẻ đã đi qua bằng "Sau" mà không chấm — chỉ hiện khi > 0 (bản cũ cũng vậy). Nằm ngang: vòng bên trái, số liệu +
 * nút bên phải (`landscape:flex-row`) — chiều cao ~290dp không đủ xếp chồng cả vòng lẫn ba nút.
 * Khối gốc là vùng `polite` để trình đọc màn hình đọc "Hoàn thành!" ngay khi hiện.
 */
export function FlashcardSummary({
  known,
  onBack,
  onRestart,
  onRetryUnknown,
  total,
  unknown,
}: FlashcardSummaryProps) {
  const skipped = Math.max(0, total - known - unknown);
  const percent = percentOf(known, total);
  const size = useResponsiveValue({ base: 132, tablet: 168 });

  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-lg py-md landscape:flex-row landscape:items-center landscape:gap-xl"
    >
      <View className="items-center gap-sm landscape:flex-1">
        <CompletionRing
          label={`Đã thuộc ${known} trên ${total} thẻ`}
          percent={percent}
          size={size}
          tone={STUDY_MODE_META.flashcards.tone}
        >
          <Text className="text-header-lg text-fg-1">{`${percent}%`}</Text>
          <Text className="text-caption-sm text-fg-2">đã thuộc</Text>
        </CompletionRing>
        <Text accessibilityRole="header" className="text-header-sm text-fg-1">
          Hoàn thành!
        </Text>
        <Text className="text-center text-body-lg text-fg-2">
          {masteryMessage(percent, known, total)}
        </Text>
      </View>
      <View className="gap-md landscape:flex-1">
        <View className="flex-row gap-xs">
          <SummaryStat label="Đã thuộc" tone="success" value={known} />
          <SummaryStat label="Chưa thuộc" tone="warning" value={unknown} />
          {skipped > 0 ? <SummaryStat label="Bỏ qua" tone="neutral" value={skipped} /> : null}
        </View>
        <View className="gap-sm">
          {unknown > 0 ? (
            <Button
              fullWidth
              label={`Học lại ${unknown} thẻ chưa thuộc`}
              onPress={onRetryUnknown}
            />
          ) : null}
          <Button fullWidth label="Học lại từ đầu" variant="secondary" onPress={onRestart} />
          <Button fullWidth label="Về bộ học" variant="tertiary" onPress={onBack} />
        </View>
      </View>
    </View>
  );
}
