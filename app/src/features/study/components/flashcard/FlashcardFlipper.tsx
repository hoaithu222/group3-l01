import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { CardMedia } from '../../utils/item-summary';
import { StudyAssetImage } from '../StudyAssetImage';
import { tickHaptic } from './card-haptics';
import {
  FLIP_MS,
  FLIP_PERSPECTIVE,
  FLIP_REDUCED_MS,
  faceOpacity,
  flipAngle,
} from './flashcard-flip';
import { FlashcardFace } from './FlashcardFace';
import { CARD_STATUS_LABEL, type CardStatus } from './study-progress';
import type { CardMode } from './study-tone.constants';

export interface FlashcardFlipperProps {
  /** Đáp án — mặt sau. */
  backText: string;
  explanation?: string | null;
  flipped: boolean;
  /** Dòng phụ dưới thuật ngữ ở mặt trước (các lựa chọn A/B/C… của trắc nghiệm). */
  frontLines: readonly string[];
  frontText: string;
  /** Ảnh của thẻ (ảnh mặt trước/sau, ảnh từng lựa chọn) — thiếu thì thẻ chỉ có chữ. Âm thanh nằm NGOÀI thẻ (màn học). */
  media?: Pick<CardMedia, 'backImage' | 'frontImage' | 'optionImages'>;
  /** Chế độ đang học — quyết định màu/icon của thẻ (`STUDY_MODE_META`). Mặc định Học thẻ. */
  mode?: CardMode;
  /** "12/40" — đưa vào nhãn trợ năng để người dùng đọc màn hình biết đang ở thẻ nào. */
  position: string;
  /** Thẻ đã chấm trong phiên (xem lại bằng "Trước") — hiện huy hiệu + đọc lên. */
  status?: CardStatus | null;
  onFlip: () => void;
}

const FACE = { backfaceVisibility: 'hidden' } as const;

/**
 * Thẻ lật 3D (app.md p4-01 §2 `FlashcardFlipper`): chạm để lật. HAI mặt cùng nằm trong cây và xoay quanh trục dọc (`rotateY`
 * + `backfaceVisibility`), một `progress` (0 → 1) dẫn cả hai — nên chạm lần nữa GIỮA CHỪNG thì thẻ quay ngược mượt, không giật.
 * Toán học (góc, công tắc mờ) ở `flashcard-flip.ts`.
 *
 * ── Trợ năng ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Cả thẻ là MỘT nút; `accessibilityLabel` mang chữ của mặt ĐANG HIỆN ("Thẻ 3/20. Mặt sau: …") và `accessibilityLiveRegion` để
 * TalkBack đọc lại khi lật/sang thẻ. Mặt đang ẩn bị `accessibilityElementsHidden` + `importantForAccessibility` (và không nhận
 * cú chạm) — có hai mặt trong cây mà trình đọc màn hình chỉ thấy một.
 *
 * ── "Giảm chuyển động" (ST-26) ──────────────────────────────────────────────────────────────────────────────────────
 * `useReducedMotion()` bật ⇒ KHÔNG xoay: hai mặt chuyển mờ 150 ms. Rung nhẹ khi lật thì vẫn giữ (giác quan khác).
 * ⛔ `Animated.View` KHÔNG mang `className` (NativeWind + Reanimated làm rơi style) — phần nhìn thấy nằm ở `FlashcardFace`.
 * ⚠️ Chưa thấy trên máy thật: cần kiểm mặt sau không lộ qua mặt trước trên Android (xem chú thích `flashcard-flip.ts`).
 */
export function FlashcardFlipper({
  backText,
  explanation,
  flipped,
  frontLines,
  frontText,
  media,
  mode = 'flashcards',
  onFlip,
  position,
  status,
}: FlashcardFlipperProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(flipped ? 1 : 0);

  useEffect(() => {
    progress.set(
      withTiming(flipped ? 1 : 0, {
        duration: reduceMotion ? FLIP_REDUCED_MS : FLIP_MS,
        easing: Easing.inOut(Easing.cubic),
      }),
    );
  }, [flipped, progress, reduceMotion]);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: faceOpacity(progress.get(), 'front', reduceMotion),
    transform: reduceMotion
      ? []
      : [
          { perspective: FLIP_PERSPECTIVE },
          { rotateY: `${flipAngle(progress.get(), 'front')}deg` },
        ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: faceOpacity(progress.get(), 'back', reduceMotion),
    transform: reduceMotion
      ? []
      : [{ perspective: FLIP_PERSPECTIVE }, { rotateY: `${flipAngle(progress.get(), 'back')}deg` }],
  }));

  const face = flipped ? 'Mặt sau' : 'Mặt trước';
  const spoken = flipped ? backText : [frontText, ...frontLines].join('. ');
  // Ảnh không có mô tả chữ nên trình đọc màn hình chỉ báo là CÓ ảnh — vẫn hơn để người nghe tưởng thẻ chỉ có chừng đó chữ.
  const hasImage = flipped
    ? Boolean(media?.backImage)
    : Boolean(media?.frontImage) || (media?.optionImages.length ?? 0) > 0;
  const statusSpoken = status ? `. ${CARD_STATUS_LABEL[status]}` : '';

  return (
    <Pressable
      accessibilityHint="Chạm hai lần để lật thẻ"
      accessibilityLabel={`Thẻ ${position}. ${face}: ${spoken}${hasImage ? '. Có ảnh minh hoạ' : ''}${statusSpoken}`}
      accessibilityLiveRegion="polite"
      accessibilityRole="button"
      className="flex-1"
      onPress={() => {
        tickHaptic();
        onFlip();
      }}
    >
      <View className="flex-1">
        <Animated.View
          accessibilityElementsHidden={flipped}
          cssInterop={false}
          importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
          pointerEvents={flipped ? 'none' : 'auto'}
          style={[StyleSheet.absoluteFill, FACE, frontStyle]}
        >
          <FlashcardFace mode={mode} side="front" status={status}>
            <Text className="text-header-sm text-fg-1 tablet:text-header-md">{frontText}</Text>
            {media?.frontImage ? (
              <StudyAssetImage
                alt="Ảnh minh hoạ mặt trước"
                assetId={media.frontImage}
                className="max-h-48"
              />
            ) : null}
            {frontLines.map((line) => (
              <Text key={line} className="text-body-lg text-fg-2">
                {line}
              </Text>
            ))}
            {media && media.optionImages.length > 0 ? (
              <View className="flex-row flex-wrap gap-sm">
                {media.optionImages.map((option) => (
                  <View key={option.assetId} className="w-24 gap-3xs">
                    <StudyAssetImage
                      alt={`Ảnh lựa chọn ${option.label}`}
                      aspect="square"
                      assetId={option.assetId}
                    />
                    <Text className="text-center text-caption-sm text-fg-2">{option.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </FlashcardFace>
        </Animated.View>
        <Animated.View
          accessibilityElementsHidden={!flipped}
          cssInterop={false}
          importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
          pointerEvents={flipped ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, FACE, backStyle]}
        >
          <FlashcardFace mode={mode} side="back" status={status}>
            <Text className="text-header-sm text-fg-1 tablet:text-header-md">{backText}</Text>
            {media?.backImage ? (
              <StudyAssetImage
                alt="Ảnh minh hoạ mặt sau"
                assetId={media.backImage}
                className="max-h-48"
              />
            ) : null}
            {explanation ? <Text className="text-body-md text-fg-2">{explanation}</Text> : null}
          </FlashcardFace>
        </Animated.View>
      </View>
    </Pressable>
  );
}
