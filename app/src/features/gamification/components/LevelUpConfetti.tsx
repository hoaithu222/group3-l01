import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** Vị trí ngang (%) + độ trễ (0–0.4 chu kỳ) của từng mảnh — cố định để không phải sinh số ngẫu nhiên mỗi lần vẽ. */
const PIECES = [
  { delay: 0, emoji: '🎉', left: 4 },
  { delay: 0.15, emoji: '✨', left: 18 },
  { delay: 0.05, emoji: '⭐', left: 32 },
  { delay: 0.3, emoji: '🎊', left: 46 },
  { delay: 0.1, emoji: '✨', left: 60 },
  { delay: 0.25, emoji: '🎉', left: 74 },
  { delay: 0.35, emoji: '⭐', left: 88 },
] as const;

const DURATION_MS = 1800;
const FALL_DISTANCE = 96;

interface PieceProps {
  delay: number;
  emoji: string;
  left: number;
  progress: SharedValue<number>;
}

function Piece({ delay, emoji, left, progress }: PieceProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (progress.get() - delay) / (1 - delay)));
    return {
      opacity: t > 0.8 ? (1 - t) * 5 : 1,
      transform: [{ translateY: t * FALL_DISTANCE }, { rotate: `${t * 300}deg` }],
    };
  });
  return (
    <Animated.View
      cssInterop={false}
      style={[{ left: `${left}%`, position: 'absolute', top: 0 }, animatedStyle]}
    >
      <Text className="text-header-sm">{emoji}</Text>
    </Animated.View>
  );
}

/**
 * Pháo giấy của `LevelUpModal` (Reanimated, một lần khi mở). ⚠️ `useReducedMotion()` (cài đặt "Giảm chuyển động" của
 * hệ điều hành) ⇒ KHÔNG vẽ gì — app.md p4-03 §7: chỉ còn thẻ chữ. ⛔ `Animated.View` không mang `className` (NativeWind
 * làm rơi style); chữ nằm ở `<Text className>` bên trong. Ẩn khỏi trình đọc màn hình — chỉ là trang trí.
 */
export function LevelUpConfetti() {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.set(withTiming(1, { duration: DURATION_MS, easing: Easing.out(Easing.quad) }));
  }, [progress, reduceMotion]);

  if (reduceMotion) return null;
  return (
    <View
      accessibilityElementsHidden
      className="h-28 self-stretch overflow-hidden"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {PIECES.map((piece) => (
        <Piece
          key={`${piece.left}`}
          delay={piece.delay}
          emoji={piece.emoji}
          left={piece.left}
          progress={progress}
        />
      ))}
    </View>
  );
}
