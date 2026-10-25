import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { swipeStrength } from './flashcard-swipe';

export interface SwipeOverlayProps {
  /** `known` hiện khi vuốt PHẢI (xanh), `unknown` hiện khi vuốt TRÁI (hổ phách). */
  side: 'known' | 'unknown';
  width: SharedValue<number>;
  x: SharedValue<number>;
}

/**
 * Lớp phủ phản hồi lúc vuốt: nền màu nhạt + viền + "tem" chữ ("Đã thuộc"/"Chưa thuộc") đậm dần theo quãng đường so với ngưỡng
 * quyết định — người dùng thấy TRƯỚC khi thả tay là mình sắp chấm gì.
 *
 * ⚠️ Màu KHÔNG phải kênh duy nhất: tem có icon + chữ. Cả lớp là hình trang trí cho người nhìn thấy: ẩn khỏi trình đọc màn hình
 * (người dùng đó chấm bằng nút "Đã thuộc"/"Chưa thuộc" bên dưới — nếu để lộ thì trình đọc màn hình đọc chữ ẩn opacity 0 và
 * có HAI phần tử cùng tên "Đã thuộc"). `pointerEvents="none"`: lớp phủ không được nuốt cú chạm lật thẻ.
 * `hổ phách` (warning) chứ không phải đỏ: "chưa thuộc" không phải lỗi — đỏ để dành cho lỗi/phá huỷ (`STUDY_MODE_META`).
 *
 * ⛔ `Animated.View` không mang `className` — phần nhìn thấy nằm ở `View` lồng bên trong.
 */
export function SwipeOverlay({ side, width, x }: SwipeOverlayProps) {
  const known = side === 'known';
  const style = useAnimatedStyle(() => {
    const dx = x.get();
    const towards = known ? dx > 0 : dx < 0;
    return { opacity: towards ? swipeStrength(dx, width.get()) : 0 };
  });

  return (
    <Animated.View
      accessibilityElementsHidden
      cssInterop={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      <View
        className={cn(
          'flex-1 rounded-md border-thick opacity-90',
          known
            ? 'border-border-success bg-surface-success'
            : 'border-border-warning bg-surface-warning',
        )}
      />
      <View
        className={cn(
          'absolute top-4 flex-row items-center gap-xs rounded-full border-thick bg-bg-1 px-md py-xs',
          known
            ? 'left-4 -rotate-6 border-border-success'
            : 'right-4 rotate-6 border-border-warning',
        )}
      >
        <Icon
          color={known ? 'success' : 'warning'}
          name={known ? 'checkmark-circle' : 'reload'}
          size={20}
        />
        <Text className="text-label-lg text-fg-1">{known ? 'Đã thuộc' : 'Chưa thuộc'}</Text>
      </View>
    </Animated.View>
  );
}
