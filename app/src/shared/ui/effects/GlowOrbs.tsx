import { useId, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Circle, Defs, RadialGradient, Stop, Svg } from 'react-native-svg';

import { type ThemeColorKey, useResolvedTheme, useThemeColors } from '@/shared/theme';
import { cn } from '@/shared/utils/style/cn';

import { MOTION_LOOP } from '../motion/motion.tokens';
import { useLoopProgress } from './useLoopProgress';

interface OrbTone {
  color: ThemeColorKey;
  /** Độ đậm ở TÂM quầng (phai về 0 ở mép). */
  opacity: number;
}

/**
 * ── ⛔ Chế độ SÁNG chỉ được LÀM SÁNG ─────────────────────────────────────────────────────────────────────────────────
 * Chữ phụ `fg-2` (#666) trên `bg-base` chỉ đạt 5.2:1. Phủ màu ĐẬM của tông (tím `#230045` 22%) là tụt xuống ~3.1:1 — rớt AA
 * ngay dưới lời chào. Nên ở chế độ sáng quầng là TRẮNG + tím RẤT nhạt (`primary-2`, 50% ở tâm ⇒ `fg-2` còn 4.78:1): nền sáng
 * lên thành đốm "bokeh", chữ tối càng rõ. Chế độ TỐI thì ngược: nền đã tối, phủ màu tông SÁNG ≤ 24% giữ `fg-2` ≥ 8:1.
 * ⚠️ Đổi các số này thì đo lại tương phản chữ nằm TRÊN quầng — `check:contrast` không thấy màu trong SVG.
 */
const PALETTE: Record<'dark' | 'light', readonly OrbTone[]> = {
  dark: [
    { color: 'fg-brand', opacity: 0.24 },
    { color: 'info', opacity: 0.16 },
    { color: 'action-accent', opacity: 0.12 },
  ],
  light: [
    { color: 'white-10', opacity: 0.7 },
    { color: 'primary-2', opacity: 0.5 },
    { color: 'white-10', opacity: 0.55 },
  ],
};

/** Tâm (x, y) và bán kính theo TỈ LỆ khung; hướng trôi (±1) khác nhau để ba quầng không đi đồng loạt như một khối. */
const ORBS = [
  { dx: 1, dy: 1, r: 0.55, x: 0.15, y: 0.15 },
  { dx: -1, dy: 1, r: 0.45, x: 0.88, y: 0.35 },
  { dx: 1, dy: -1, r: 0.5, x: 0.5, y: 1 },
] as const;

/** Biên độ trôi = 6% bề rộng: đủ để thấy "sống", chưa đủ để thấy chạy. */
const DRIFT_RATIO = 0.06;

export interface GlowOrbsProps {
  /** Tắt trôi khi màn bị che (tab khác — `useIsFocused()`), quầng vẫn vẽ đứng yên. Mặc định bật. */
  active?: boolean;
  /** Lớp BỐ CỤC của lớp nền (mặc định phủ kín cha: `absolute inset-0`). Bo góc theo thẻ chứa nó (`rounded-md`). */
  className?: string;
  /** `subtle` (60%) cho nền SAU chữ dày; mặc định `vivid` cho khoảng trống đầu màn/hero. */
  intensity?: 'subtle' | 'vivid';
}

/**
 * Nền "cực quang": ba quầng màu mềm TRÔI rất chậm phía sau khối hero (lời chào Trang chủ, màn đăng nhập, ví xu…) — cho
 * khoảng trống đầu màn có chiều sâu thay vì một mảng phẳng. Ý tưởng từ `ui-mobile/flutterfx_widgets` (`AuroraBackground`),
 * dựng lại bằng `react-native-svg` (không cần blur: gradient toả tròn TỰ mềm mép) + token màu ⇒ đổi theo sáng/tối.
 *
 * ```tsx
 * <View className="overflow-hidden rounded-md">
 *   <GlowOrbs active={isFocused} />
 *   …nội dung…
 * </View>
 * ```
 *
 * ⛔ Trang trí thuần: ẩn khỏi trình đọc màn hình, không ăn cú chạm. ⛔ Đặt TRƯỚC nội dung (anh em vẽ sau nằm trên).
 * ⚠️ Là MỘT vòng lặp nổi bật của màn (`MOTION_LOOP`) — đừng đặt cạnh `BorderBeam`/`ShimmerSweep loop` trên cùng màn.
 * ⚠️ Cha phải `overflow-hidden` nếu không muốn quầng tràn ra ngoài thẻ.
 */
export function GlowOrbs({ active = true, className, intensity = 'vivid' }: GlowOrbsProps) {
  const theme = useResolvedTheme();
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);
  const progress = useLoopProgress({
    active,
    duration: MOTION_LOOP.drift,
    reverse: true,
    still: 0.5,
  });
  const scale = intensity === 'subtle' ? 0.6 : 1;

  const onLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setSize((prev) => (prev?.width === width && prev.height === height ? prev : { height, width }));
  };

  return (
    <View
      accessibilityElementsHidden
      className={cn('absolute inset-0 overflow-hidden', className)}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      onLayout={onLayout}
    >
      {size
        ? ORBS.map((orb, index) => {
            // Bảng màu có ĐÚNG ba quầng như `ORBS`; thiếu (bảng sửa lệch) thì bỏ quầng đó chứ không vẽ màu rỗng.
            const tone = PALETTE[theme][index];
            return tone ? (
              <Orb
                key={index}
                drift={size.width * DRIFT_RATIO}
                frame={size}
                orb={orb}
                progress={progress}
                tone={{ color: tone.color, opacity: tone.opacity * scale }}
              />
            ) : null;
          })
        : null}
    </View>
  );
}

function Orb({
  drift,
  frame,
  orb,
  progress,
  tone,
}: {
  drift: number;
  frame: { height: number; width: number };
  orb: (typeof ORBS)[number];
  progress: SharedValue<number>;
  tone: OrbTone;
}) {
  const colors = useThemeColors();
  const id = `orb-${useId().replace(/:/g, '')}`;
  const radius = frame.width * orb.r;

  // Tiến độ trôi 0 → 1 → 0 (hình sin) ⇒ lệch tâm từ −drift tới +drift theo hướng riêng của quầng.
  const style = useAnimatedStyle(() => {
    const offset = (progress.get() - 0.5) * 2 * drift;
    return { transform: [{ translateX: offset * orb.dx }, { translateY: offset * orb.dy }] };
  });

  return (
    // ⛔ `cssInterop={false}`: thẻ mang mảng [vị trí tĩnh, handle hoạt ảnh] — để NativeWind gộp là mất vị trí (quầng dạt về góc).
    <Animated.View
      cssInterop={false}
      style={[
        {
          height: radius * 2,
          left: frame.width * orb.x - radius,
          position: 'absolute',
          top: frame.height * orb.y - radius,
          width: radius * 2,
        },
        style,
      ]}
    >
      <Svg height="100%" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="50%" id={id} r="50%">
            <Stop offset="0" stopColor={colors[tone.color]} stopOpacity={tone.opacity} />
            <Stop offset="0.55" stopColor={colors[tone.color]} stopOpacity={tone.opacity * 0.45} />
            <Stop offset="1" stopColor={colors[tone.color]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="50%" fill={`url(#${id})`} r="50%" />
      </Svg>
    </Animated.View>
  );
}
