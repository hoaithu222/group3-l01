import { Text, View } from 'react-native';

import type { SrRating } from '../../api/sr.types';
import { formatInterval, previewIntervals, SR_RATING_ORDER, type Sm2Progress } from '../../utils/sm2-preview';
import { ActionTile } from '../flashcard/ActionTile';
import { SR_DEFAULT_RATING, SR_RATING_META } from './sr-rating.constants';

export interface SrFeedbackButtonsProps {
  disabled?: boolean;
  onRate: (rating: SrRating) => void;
  /** Tiến độ hiện tại của thẻ — có thì mỗi ô hiện khoảng ôn dự kiến ("16 ngày") tính bằng `sm2-preview`. */
  progress?: Sm2Progress;
  /** Mức gợi ý (thẻ chấm được: đúng → GOOD, sai → AGAIN) — ô được tô ĐẶC, người dùng vẫn chọn tự do. */
  suggested?: SrRating;
}

/**
 * Bốn mức đánh giá SM-2 (app.md p4-02 §2, §7) — chỉ hiện SAU khi lật thẻ. Mỗi ô là MỘT vùng chạm ≥ 56dp có màu theo mức + chữ nhãn
 * + dòng "⏱ 16 ngày" (khoảng ôn dự kiến — chỉ để tham khảo, server tính lịch thật; ⛔ không bịa: không có `progress` thì không có
 * dòng này). Đọc lên: "Đánh giá: Dễ, ôn lại sau 16 ngày". Người dùng chấm hàng chục thẻ liền, trượt ô là chấm sai mức.
 *
 * Nằm ngang: cột nút hẹp nên bốn ô xếp 2×2 (`landscape:flex-wrap` + `basis-[45%]`) thay vì chia 4 trong ~250dp.
 * Ô "được nhấn" (đặc) là `suggested`, không có thì "Vừa" — như bản cũ đặt "Vừa" làm nút chính.
 */
export function SrFeedbackButtons({
  disabled,
  onRate,
  progress,
  suggested,
}: SrFeedbackButtonsProps) {
  const preview = progress ? previewIntervals(progress) : null;
  const emphasised = suggested ?? SR_DEFAULT_RATING;
  return (
    <View className="gap-xs">
      <Text className="text-center text-label-sm text-fg-2">Bạn nhớ thẻ này thế nào?</Text>
      <View className="flex-row gap-xs landscape:flex-wrap">
        {SR_RATING_ORDER.map((rating) => {
          const meta = SR_RATING_META[rating];
          const when = preview ? formatInterval(preview[rating]) : null;
          return (
            <ActionTile
              key={rating}
              accessibilityLabel={`Đánh giá: ${meta.label}${when ? `, ôn lại sau ${when}` : ''}`}
              className="flex-1 landscape:basis-[45%]"
              disabled={disabled}
              hint={when ?? undefined}
              label={meta.label}
              solid={rating === emphasised}
              tone={meta.tone}
              onPress={() => onRate(rating)}
            />
          );
        })}
      </View>
    </View>
  );
}
