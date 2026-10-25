import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Path, Svg } from 'react-native-svg';

import { type ThemeColorKey, useThemeColors } from '@/shared/theme';
import { cn } from '@/shared/utils/style/cn';

import { MOTION_LOOP } from '../motion/motion.tokens';
import { useLoopProgress } from './useLoopProgress';

/** Ngôi sao bốn cánh (✦) trong khung 24 — cánh cong vào tâm cho mềm, không phải bốn tam giác nhọn. */
const STAR_PATH =
  'M12 0C12.7 6.2 17.8 11.3 24 12C17.8 12.7 12.7 17.8 12 24C11.3 17.8 6.2 12.7 0 12C6.2 11.3 11.3 6.2 12 0Z';

/**
 * Vị trí (theo % khung), cỡ (× `size`) và PHA (0–1, lệch nhịp để các sao không loé cùng lúc) — rải quanh MÉP khung, chừa
 * trung tâm cho nội dung. Thứ tự là thứ tự ưu tiên khi `count` nhỏ.
 */
const SPOTS = [
  { phase: 0, s: 1, x: '6%', y: '16%' },
  { phase: 0.45, s: 0.7, x: '90%', y: '10%' },
  { phase: 0.25, s: 0.85, x: '84%', y: '80%' },
  { phase: 0.7, s: 0.55, x: '14%', y: '86%' },
  { phase: 0.9, s: 0.5, x: '50%', y: '2%' },
] as const;

export interface SparklesProps {
  /** Tắt nhịp lấp lánh khi màn bị che — sao vẫn đứng yên ở độ sáng vừa. Mặc định bật. */
  active?: boolean;
  /** Lớp BỐ CỤC của lớp sao (mặc định phủ kín cha `absolute inset-0` — cha cần `relative`/kích thước). */
  className?: string;
  /** Số sao (1–5). */
  count?: number;
  /** Cỡ sao lớn nhất (dp). */
  size?: number;
  /** Màu sao — token. Mặc định `action-accent` (vàng: "phần thưởng", "thành tích"). */
  tone?: ThemeColorKey;
}

/**
 * Vài ngôi sao nhỏ LẤP LÁNH quanh một điểm nhấn (huy hiệu cấp độ, ảnh đại diện, quyển sách đăng nhập, số dư ví) — lệch
 * nhịp nhau như sao thật. Ý tưởng từ `ui-mobile/flutterfx_widgets` (`AnimatedSparkle`), dựng bằng `react-native-svg`.
 *
 * ```tsx
 * <View className="relative">
 *   <IconTile name="star" size="lg" tone="accent" />
 *   <Sparkles className="-inset-3" count={3} size={10} />
 * </View>
 * ```
 *
 * ⛔ Trang trí thuần: ẩn khỏi trình đọc màn hình, không ăn cú chạm. MỘT vòng lặp chung cho mọi sao (không phải mỗi sao một
 * vòng) ⇒ rẻ. "Giảm chuyển động" ⇒ sao đứng yên, không loé.
 * ⚠️ Vàng `action-accent` trên nền trắng chỉ ~3.35:1 — đủ cho hình trang trí (không mang nghĩa), ⛔ đừng dùng sao làm dấu
 * hiệu DUY NHẤT của một trạng thái.
 */
export function Sparkles({
  active = true,
  className,
  count = 4,
  size = 12,
  tone = 'action-accent',
}: SparklesProps) {
  const colors = useThemeColors();
  const progress = useLoopProgress({ active, duration: MOTION_LOOP.twinkle * 2, still: 0.5 });
  const spots = SPOTS.slice(0, Math.min(Math.max(count, 1), SPOTS.length));

  return (
    <View
      accessibilityElementsHidden
      className={cn('absolute inset-0', className)}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {spots.map((spot) => (
        <Star
          key={`${spot.x}-${spot.y}`}
          color={colors[tone]}
          progress={progress}
          size={size * spot.s}
          spot={spot}
        />
      ))}
    </View>
  );
}

function Star({
  color,
  progress,
  size,
  spot,
}: {
  color: string;
  progress: SharedValue<number>;
  size: number;
  spot: (typeof SPOTS)[number];
}) {
  // Nhịp riêng của sao = tiến độ chung lệch PHA; sin² cho sáng lên-tắt đi mềm, có quãng "tắt" dài như sao nhấp nháy thật.
  const style = useAnimatedStyle(() => {
    const local = (progress.get() + spot.phase) % 1;
    const glow = Math.sin(Math.PI * local) ** 2;
    return {
      opacity: 0.25 + 0.75 * glow,
      transform: [{ scale: 0.6 + 0.4 * glow }, { rotate: `${45 * glow}deg` }],
    };
  });

  return (
    // ⛔ `cssInterop={false}`: mảng [vị trí tĩnh theo %, handle hoạt ảnh] — NativeWind gộp là sao dạt hết về góc trên trái.
    <Animated.View
      cssInterop={false}
      style={[
        {
          height: size,
          left: spot.x,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          position: 'absolute',
          top: spot.y,
          width: size,
        },
        style,
      ]}
    >
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Path d={STAR_PATH} fill={color} />
      </Svg>
    </Animated.View>
  );
}
