import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { AnswerCardState } from '../../utils/quick-quiz-result';
import { StudyAssetImage } from '../StudyAssetImage';
import { answerCard } from './answer-card.styles';

export interface AnswerCardProps {
  /** Khoá bấm sau khi câu đã chấm — thẻ vẫn hiện để tô đúng/sai. */
  disabled: boolean;
  /** Ảnh của lựa chọn (nếu có) — hiện trên chữ. */
  imageAssetId: string | null;
  /** Ký hiệu A, B, C… */
  letter: string;
  /** Nhiều đáp án: ô vuông (checkbox) thay vì ô tròn (radio). */
  multi: boolean;
  state: AnswerCardState;
  text: string;
  onPress: () => void;
}

/** Chữ đi kèm trạng thái SAU KHI CHẤM — để người học không phải phân biệt bằng màu. `idle`/`selected`/`muted` không có chú thích. */
const CAPTION: Partial<Record<AnswerCardState, string>> = {
  correct: 'Đúng',
  missed: 'Đáp án đúng',
  wrong: 'Sai',
};

function trailingIcon(state: AnswerCardState, multi: boolean) {
  if (state === 'correct' || state === 'missed') {
    return <Icon color="success" name="checkmark-circle" size={24} variant="solid" />;
  }
  if (state === 'wrong')
    return <Icon color="error" name="clear-circle" size={24} variant="solid" />;
  if (state === 'selected') {
    return (
      <Icon
        color="fg-brand"
        name={multi ? 'checkmark-square' : 'checkmark-circle'}
        size={24}
        variant="solid"
      />
    );
  }
  return null;
}

/**
 * Một đáp án của Quiz nhanh — thẻ bấm được CAO THEO NỘI DUNG (≥ 56dp), không phải `Button`/`Chip`/`RadioGroup` của bộ chung (chúng ôm sát chữ, một
 * dòng, không có ký hiệu A/B/C và không có dáng "đúng/sai/bỏ sót" sau khi chấm — cùng lý do `AnswerOption` của Thi thử, nhưng thẻ này còn phải
 * tô kết quả). Trợ năng: `radio`/`checkbox` + `checked`; nhãn nối thêm kết quả ("A. Hà Nội, đúng") để trình đọc màn hình biết mà không cần thấy màu.
 */
export function AnswerCard({
  disabled,
  imageAssetId,
  letter,
  multi,
  onPress,
  state,
  text,
}: AnswerCardProps) {
  const caption = CAPTION[state];
  const checked = state === 'selected' || state === 'correct' || state === 'wrong';

  return (
    <Pressable
      accessibilityLabel={
        caption ? `${letter}. ${text}, ${caption.toLowerCase()}` : `${letter}. ${text}`
      }
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => {
        const styles = answerCard({ multi, pressed: pressed && state === 'idle', state });
        return (
          <View className={styles.root()}>
            <View className={styles.marker()}>
              <Text className={styles.letter()} maxFontSizeMultiplier={1.3}>
                {letter}
              </Text>
            </View>
            <View className="flex-1 gap-2xs">
              {imageAssetId ? (
                <StudyAssetImage
                  alt={`Ảnh của đáp án ${letter}`}
                  aspect="banner-slim"
                  assetId={imageAssetId}
                />
              ) : null}
              <Text className={styles.text()}>{text}</Text>
              {caption ? <Text className={styles.caption()}>{caption}</Text> : null}
            </View>
            <View className={styles.box()}>{trailingIcon(state, multi)}</View>
          </View>
        );
      }}
    </Pressable>
  );
}
