import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { Icon } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { StudyAssetImage } from '../StudyAssetImage';

/**
 * Một đáp án của câu trắc nghiệm — thẻ bấm được, KHÔNG phải `Button` primary/secondary.
 *
 * ── Vì sao không dùng `Button` / `Chip` / `RadioGroup` của bộ chung ─────────────────────────────────────────────────
 * `Button` ôm sát chữ và chỉ có hai dáng (chọn/không) nên câu dài xuống dòng là nút cao lệch, và trình đọc màn hình đọc
 * nó như nút hành động chứ không phải lựa chọn; `Chip` một dòng, cao cố định; `Radio` không phải thẻ rộng có chữ A/B/C.
 * Đề thi cần thẻ CAO THEO NỘI DUNG, có ký hiệu A/B/C, và trạng thái rõ ngay khi liếc.
 *
 * ── Trạng thái đọc được KHÔNG cần màu ────────────────────────────────────────────────────────────────────────────────
 * Chưa chọn: viền mảnh + ô tròn/vuông RỖNG bên phải. Đã chọn: viền dày + nền tông `info` + dấu tích đặc. Hình ô bên phải
 * cho biết cách chọn (tròn = một đáp án, vuông = nhiều đáp án). Trình đọc màn hình nghe `radio`/`checkbox` + `checked`.
 * Khoá (hết giờ): mờ đi + `disabled`.
 */
const option = tv(
  {
    slots: {
      root: 'min-h-14 flex-row items-center gap-sm rounded-md border-medium px-md py-sm',
      marker: 'size-9 items-center justify-center rounded-full',
      letter: 'text-label-md font-semibold',
      // `flex-1` ở cột bọc (ảnh + chữ), không ở chữ: đáp án có ảnh thì ảnh nằm TRÊN chữ trong cùng cột.
      body: 'flex-1 gap-2xs',
      text: 'text-body-lg',
      box: 'size-6 items-center justify-center border-medium',
    },
    variants: {
      selected: {
        true: {
          root: 'border-border-info bg-surface-info',
          marker: 'bg-action-info',
          letter: 'text-action-info-fg',
          text: 'font-semibold text-fg-1',
          box: 'border-transparent',
        },
        false: {
          root: 'border-border-1 bg-bg-1',
          marker: 'border-hairline border-border-2 bg-bg-3',
          letter: 'text-fg-2',
          text: 'text-fg-1',
          box: 'border-border-strong',
        },
      },
      multi: { true: { box: 'rounded-3xs' }, false: { box: 'rounded-full' } },
      pressed: { true: { root: 'bg-surface-info' } },
      disabled: { true: { root: 'opacity-60' } },
    },
    defaultVariants: { disabled: false, multi: false, pressed: false, selected: false },
  },
  { twMergeConfig },
);

export interface AnswerOptionProps {
  disabled?: boolean;
  /** Ảnh của lựa chọn (`option.mediaAssetId`) — có thì vẽ trên chữ, cùng khuôn `AnswerCard` của Quiz nhanh. */
  imageAssetId?: string | null;
  /** Ký hiệu A, B, C… */
  letter: string;
  /** Câu nhiều đáp án: ô vuông (checkbox) thay vì ô tròn (radio). */
  multi: boolean;
  selected: boolean;
  text: string;
  onPress: () => void;
}

export function AnswerOption({
  disabled = false,
  imageAssetId,
  letter,
  multi,
  onPress,
  selected,
  text,
}: AnswerOptionProps) {
  return (
    <Pressable
      accessibilityLabel={`${letter}. ${text}`}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => {
        const styles = option({ disabled, multi, pressed: pressed && !selected, selected });
        return (
          <View className={styles.root()}>
            <View className={styles.marker()}>
              <Text className={styles.letter()} maxFontSizeMultiplier={1.3}>
                {letter}
              </Text>
            </View>
            <View className={styles.body()}>
              {imageAssetId ? (
                <StudyAssetImage alt={`Ảnh của đáp án ${letter}`} assetId={imageAssetId} />
              ) : null}
              <Text className={styles.text()}>{text}</Text>
            </View>
            <View className={styles.box()}>
              {selected ? (
                <Icon
                  color="info"
                  name={multi ? 'checkmark-square' : 'checkmark-circle'}
                  size={24}
                  variant="solid"
                />
              ) : null}
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}
