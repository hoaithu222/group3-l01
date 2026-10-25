import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';
import type { IconTileTone } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import { celebrateHaptic } from './card-haptics';
import { TONE_COLOR, TONE_FILL, TRACK_COLOR } from './study-tone.constants';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DRAW_MS = 900;
const HALO_DELAY_MS = 700;
const HALO_MS = 700;
const POP_DELAY_MS = 250;
const POP_SPRING = { damping: 12, stiffness: 160 } as const;
const CENTER = { alignItems: 'center', justifyContent: 'center' } as const;

export interface CompletionRingProps {
  /** Nhãn cho trình đọc màn hình ("Đã thuộc 7 trên 10 thẻ"). Giá trị % được đọc kèm qua `accessibilityValue`. */
  label: string;
  /** 0..100 — phần vòng tô đầy. */
  percent: number;
  tone: IconTileTone;
  /** Nội dung ở TÂM vòng (số %, icon). ⚠️ Phải vừa trong `size − 2×nét`. */
  children?: ReactNode;
  /** Rung nhẹ MỘT lần khi hiện — chỉ bật ở khoảnh khắc HOÀN THÀNH, không bật ở màn "đã ôn xong" mở lại. Mặc định bật. */
  celebrate?: boolean;
  size?: number;
}

/**
 * Vòng hoàn thành: nét vòng VẼ DẦN từ 0 tới `percent` (900 ms), số/icon ở tâm nảy nhẹ vào (lò xo), rồi một quầng tròn mờ toả ra
 * đúng một nhịp — khoảnh khắc "xong" tinh tế, không pháo hoa. "Giảm chuyển động" ⇒ vòng ở mức cuối ngay, không nảy, không quầng
 * (rung nhẹ vẫn giữ).
 *
 * ── Vì sao không dùng `ProgressRing` của bộ chung ────────────────────────────────────────────────────────────────────
 * `ProgressRing` nhận `progress` tĩnh — muốn vòng CHẠY thì phải `setState` mỗi khung hình (đúng thứ luật hiệu năng cấm); nó cũng
 * chỉ có ba tông và đường nền `bg-3` (gần như vô hình trên nền màn). Ở đây nét vẽ bằng `useAnimatedProps` (luồng UI). Hai
 * chỗ dùng (tổng kết Học thẻ, tổng kết Ôn theo lịch) đều trong feature này; nếu feature khác cần thì đưa lên `shared/ui`.
 *
 * ⚠️ Màu vẽ bằng SVG nên đi qua `useThemeColors()` (token → mã màu theo sáng/tối) — ⛔ không truyền hex. Chưa thấy trên máy thật.
 */
export function CompletionRing({
  celebrate = true,
  children,
  label,
  percent,
  size = 132,
  tone,
}: CompletionRingProps) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const target = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const stroke = Math.max(6, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const arc = useSharedValue(reduceMotion ? target / 100 : 0);
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  const halo = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (celebrate) celebrateHaptic();
  }, [celebrate]);

  useEffect(() => {
    if (reduceMotion) {
      arc.set(target / 100);
      pop.set(1);
      halo.set(1);
      return;
    }
    arc.set(withTiming(target / 100, { duration: DRAW_MS, easing: Easing.out(Easing.cubic) }));
    pop.set(withDelay(POP_DELAY_MS, withSpring(1, POP_SPRING)));
    halo.set(
      withDelay(
        HALO_DELAY_MS,
        withTiming(1, { duration: HALO_MS, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [arc, halo, pop, reduceMotion, target]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - arc.get()) }));
  const centerStyle = useAnimatedStyle(() => ({
    opacity: pop.get(),
    transform: [{ scale: 0.6 + 0.4 * pop.get() }],
  }));
  const haloStyle = useAnimatedStyle(() => {
    const spread = halo.get();
    // Chưa tới lượt (`spread` = 0) thì ẩn hẳn — quầng chỉ nổ ra SAU khi vòng đã tô xong.
    return {
      opacity: spread > 0 ? (1 - spread) * 0.35 : 0,
      transform: [{ scale: 1 + 0.35 * spread }],
    };
  });

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(target) }}
      accessible
      style={{ height: size, width: size }}
    >
      <Animated.View
        cssInterop={false}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, haloStyle]}
      >
        <View className={cn('flex-1 rounded-full', TONE_FILL[tone])} />
      </Animated.View>
      <Svg height={size} width={size}>
        <Circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke={colors[TRACK_COLOR]}
          strokeWidth={stroke}
        />
        <AnimatedCircle
          animatedProps={arcProps}
          cx={center}
          cy={center}
          fill="none"
          originX={center}
          originY={center}
          r={radius}
          rotation={-90}
          stroke={colors[TONE_COLOR[tone]]}
          strokeDasharray={`${String(circumference)} ${String(circumference)}`}
          strokeLinecap="round"
          strokeWidth={stroke}
        />
      </Svg>
      {/* ⚠️ Tắt interop cả khi không có className: gộp mảng style làm mất absoluteFill/CENTER, đẩy icon xuống dưới vòng. */}
      <Animated.View
        cssInterop={false}
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, CENTER, centerStyle]}
      >
        {children}
      </Animated.View>
    </View>
  );
}
