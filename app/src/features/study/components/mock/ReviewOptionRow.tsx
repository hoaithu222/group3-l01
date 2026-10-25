import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import type { OptionReviewState } from '../../utils/mock-review-utils';
import { StudyAssetImage } from '../StudyAssetImage';

/**
 * Một đáp án ở màn xem lại. Bốn trạng thái, mỗi trạng thái KHÁC HÌNH (viền liền/đứt, icon) + có CHỮ ("Bạn chọn · Đúng",
 * "Bạn chọn · Sai", "Đáp án đúng") — màu xanh/đỏ chỉ là lớp phụ:
 *  · `picked-correct` nền xanh + dấu tích đặc · `picked-wrong` nền đỏ + dấu ✕ đặc
 *  · `missed` (đúng mà bạn KHÔNG chọn) viền xanh NÉT ĐỨT + dấu tích rỗng · `plain` đáp án còn lại, trơn.
 */
const row = tv(
  {
    slots: {
      root: 'flex-row items-center gap-sm rounded-sm border-medium px-sm py-xs',
      marker: 'size-8 items-center justify-center rounded-full bg-bg-3',
    },
    variants: {
      state: {
        'picked-correct': { root: 'border-solid border-border-success bg-surface-success' },
        'picked-wrong': { root: 'border-solid border-border-error bg-surface-error' },
        missed: { root: 'border-dashed border-border-success bg-bg-1' },
        plain: { root: 'border-solid border-border-1 bg-bg-1' },
      },
    },
    defaultVariants: { state: 'plain' },
  },
  { twMergeConfig },
);

const ICON: Record<
  OptionReviewState,
  { color: ThemeColorKey; name: IconName; solid: boolean } | null
> = {
  missed: { color: 'success', name: 'checkmark-circle', solid: false },
  'picked-correct': { color: 'success', name: 'checkmark-circle', solid: true },
  'picked-wrong': { color: 'error', name: 'clear-circle', solid: true },
  plain: null,
};

export interface ReviewOptionRowProps {
  /** Ảnh của lựa chọn (`option.mediaAssetId`) — vẽ trên chữ, như lúc làm bài (`AnswerOption`). */
  imageAssetId?: string | null;
  /** Ký hiệu A, B, C… — bỏ trống cho dòng của câu điền. */
  letter?: string;
  state: OptionReviewState;
  /** Nhãn chữ theo trạng thái (`optionTag`); `null` ⇒ không nhãn. */
  tag: string | null;
  text: string;
}

export function ReviewOptionRow({ imageAssetId, letter, state, tag, text }: ReviewOptionRowProps) {
  const styles = row({ state });
  const icon = ICON[state];
  return (
    <View accessibilityLabel={tag ? `${text}. ${tag}` : text} accessible className={styles.root()}>
      {letter ? (
        <View className={styles.marker()}>
          <Text className="text-label-md font-semibold text-fg-2" maxFontSizeMultiplier={1.3}>
            {letter}
          </Text>
        </View>
      ) : null}
      <View className="flex-1 gap-3xs">
        {imageAssetId ? (
          <StudyAssetImage
            alt={letter ? `Ảnh của đáp án ${letter}` : 'Ảnh của đáp án'}
            assetId={imageAssetId}
          />
        ) : null}
        <Text className="text-body-md text-fg-1">{text}</Text>
        {tag ? <Text className="text-label-sm font-semibold text-fg-2">{tag}</Text> : null}
      </View>
      {icon ? (
        <Icon
          color={icon.color}
          name={icon.name}
          size={24}
          variant={icon.solid ? 'solid' : 'linear'}
        />
      ) : null}
    </View>
  );
}
