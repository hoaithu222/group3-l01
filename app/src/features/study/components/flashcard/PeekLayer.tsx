import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { swipeStrength } from './flashcard-swipe';

/** Mỗi lớp lấp ló thấp hơn lớp trước bấy nhiêu dp và nhỏ đi bấy nhiêu phần. */
const PEEK_OFFSET = 8;
const PEEK_SCALE_STEP = 0.04;
/** Co quanh MÉP DƯỚI: dải lấp ló dưới thẻ luôn dày đúng `PEEK_OFFSET`, không phụ thuộc chiều cao thẻ. */
const ORIGIN = { transformOrigin: '50% 100%' } as const;

export interface PeekLayerProps {
  /** 1 = thẻ kế tiếp, 2 = thẻ sau nữa. */
  depth: 1 | 2;
  /** Bề rộng khung (shared value của `useDeckSwipe`) — chưa đo thì 0 ⇒ ngưỡng dùng sàn. Không truyền ⇒ tĩnh (ôn theo lịch: không vuốt). */
  width?: SharedValue<number>;
  /** Độ dịch ngang của thẻ trên cùng — kéo càng xa, lớp này càng "trồi" lên vị trí của lớp trước nó. */
  x?: SharedValue<number>;
}

/**
 * Thẻ kế tiếp lấp ló phía sau thẻ đang học (xếp chồng) — CHỈ là hình: rỗng, không chữ, không ảnh, ẩn khỏi trình đọc màn hình
 * (nội dung thẻ kế chỉ nạp khi tới lượt, đỡ tải ảnh thừa và không nhân đôi chữ trên màn).
 *
 * ⛔ `Animated.View` không mang `className` — phần nhìn thấy nằm ở `View` lồng bên trong.
 */
export function PeekLayer({ depth, width, x }: PeekLayerProps) {
  const idleX = useSharedValue(0);
  const idleWidth = useSharedValue(0);
  const dragX = x ?? idleX;
  const frame = width ?? idleWidth;

  const style = useAnimatedStyle(() => {
    // `level` = "còn cách vị trí trên cùng mấy nấc": kéo hết ngưỡng thì lớp 1 về 0 (thành thẻ đầy đủ), lớp 2 về 1 (thành lớp 1).
    const level = depth - swipeStrength(dragX.get(), frame.get());
    return {
      transform: [{ translateY: level * PEEK_OFFSET }, { scale: 1 - level * PEEK_SCALE_STEP }],
    };
  });

  return (
    <Animated.View
      cssInterop={false}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, ORIGIN, style]}
    >
      <View
        accessibilityElementsHidden
        className="flex-1 rounded-md border border-border-1 bg-bg-1"
        importantForAccessibility="no-hide-descendants"
      />
    </Animated.View>
  );
}
