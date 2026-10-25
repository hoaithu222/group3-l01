import { Text, View } from 'react-native';

import { useResponsiveValue } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

import type { SrRating, SrSummary } from '../../api/sr.types';
import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { SR_RATING_ORDER } from '../../utils/sm2-preview';
import { CompletionRing } from '../flashcard/CompletionRing';
import { summarizeRatings } from '../flashcard/study-progress';
import { SummaryStat } from '../flashcard/SummaryStat';
import { SR_RATING_META } from './sr-rating.constants';
import { SrWeekStrip } from './SrWeekStrip';

export interface SrSessionSummaryProps {
  onContinue: () => void;
  onDone: () => void;
  /** Số thẻ còn lại hôm nay ngoài lô đã ôn (`due.remainingToday`) — > 0 ⇒ nút "Ôn tiếp". */
  remainingToday: number;
  /** Số lần chọn từng mức trong phiên vừa xong. */
  stats: Record<SrRating, number>;
  /** `useSrSummary` — chưa tải/lỗi thì bỏ phần "Mai ôn" và lịch 7 ngày (không chặn tóm tắt). */
  summary?: SrSummary;
}

/**
 * Tóm tắt sau phiên ôn (app.md p4-02 §3 `SrSessionSummary`): vòng "nhớ được n%" vẽ dần (thẻ không chọn "Quên" — theo SM-2 q ≥ 3 là
 * còn nhớ) + "Bạn đã ôn N thẻ. Mai ôn M thẻ." (M = ngày đầu của `dueNext7Days` — mảng đó KHÔNG gồm hôm nay) + bốn ô phân bố mức
 * (cùng màu với nút chấm) + lịch 7 ngày + "Ôn tiếp N thẻ" khi hôm nay còn thẻ ngoài lô 50.
 *
 * ⚠️ Con số duy nhất tự tính ở đây là % nhớ (`summarizeRatings`) — số đếm và "Mai ôn" đều là số thật từ phiên/server, không bịa.
 * Nằm ngang: hero bên trái, số liệu + nút bên phải. Khối gốc là vùng `polite` để trình đọc màn hình đọc kết quả ngay khi hiện.
 */
export function SrSessionSummary({
  onContinue,
  onDone,
  remainingToday,
  stats,
  summary,
}: SrSessionSummaryProps) {
  const { recallPercent, remembered, total } = summarizeRatings(stats);
  const tomorrow = summary?.dueNext7Days[0]?.count;
  const size = useResponsiveValue({ base: 132, tablet: 168 });

  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-lg landscape:flex-row landscape:items-center landscape:gap-xl"
    >
      <View className="items-center gap-sm landscape:flex-1">
        <CompletionRing
          label={`Nhớ được ${remembered} trên ${total} thẻ`}
          percent={recallPercent}
          size={size}
          tone={STUDY_MODE_META.sr.tone}
        >
          <Text className="text-header-lg text-fg-1">{`${recallPercent}%`}</Text>
          <Text className="text-caption-sm text-fg-2">nhớ được</Text>
        </CompletionRing>
        <Text accessibilityRole="header" className="text-header-sm text-fg-1">
          Hoàn thành phiên ôn
        </Text>
        <Text className="text-center text-body-lg text-fg-2">
          {`Bạn đã ôn ${total} thẻ.${tomorrow === undefined ? '' : ` Mai ôn ${tomorrow} thẻ.`}`}
        </Text>
      </View>
      <View className="gap-md landscape:flex-1">
        <View accessibilityLabel="Phân bố đánh giá trong phiên" className="flex-row gap-xs">
          {SR_RATING_ORDER.map((rating) => (
            <SummaryStat
              key={rating}
              label={SR_RATING_META[rating].label}
              tone={SR_RATING_META[rating].tone}
              value={stats[rating]}
            />
          ))}
        </View>
        {summary ? (
          <Card title="7 ngày tới">
            <SrWeekStrip days={summary.dueNext7Days} />
          </Card>
        ) : null}
        <View className="gap-sm">
          {remainingToday > 0 ? (
            <Button
              fullWidth
              label={`Ôn tiếp ${remainingToday} thẻ`}
              variant="secondary"
              onPress={onContinue}
            />
          ) : null}
          <Button fullWidth label="Xong" variant="success" onPress={onDone} />
        </View>
      </View>
    </View>
  );
}
