import { useId, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { type ThemeColorKey, useThemeColors } from '@/shared/theme';
import { cn } from '@/shared/utils/style/cn';

import { MOTION_LOOP } from '../motion/motion.tokens';
import { useLoopProgress } from './useLoopProgress';

/** Dải sáng rộng 40% bề mặt (tối thiểu 48dp) — hẹp hơn thì thành một vạch, rộng hơn thì cả bề mặt loé lên. */
const BAND_RATIO = 0.4;
const BAND_MIN = 48;

export interface ShimmerSweepProps {
  /** Tắt khi màn bị che. Mặc định bật. */
  active?: boolean;
  /** Bo góc của lớp quét — ⛔ PHẢI khớp bo góc của bề mặt nằm dưới (`rounded-full` cho nút, `rounded-md` cho thẻ). */
  className?: string;
  /** Chờ trước lượt đầu (ms) — cho ánh quét đi SAU nhịp hiện dần của màn. */
  delay?: number;
  /** Mặc định quét MỘT lần lúc hiện. `true` = lặp, nghỉ `MOTION_LOOP.sweepRest` giữa hai lần (tính là vòng lặp nổi bật). */
  loop?: boolean;
  /** Độ sáng ở giữa dải (0–1). Mặc định 0.35. */
  strength?: number;
  /** Màu ánh — mặc định `white-10` (trắng ở CẢ hai chế độ: ánh sáng lướt qua bề mặt, không phải màu thương hiệu). */
  tone?: ThemeColorKey;
}

/**
 * ÁNH QUÉT: một dải sáng nghiêng lướt ngang qua bề mặt — điểm nhấn cho nút/thẻ CHÍNH (nút "Đăng nhập", số dư ví, huy
 * hiệu cấp độ, thẻ phân hệ đã ghim). Ý tưởng từ `ui-mobile/flutterfx_widgets` (`ShimmerButton`, `ShimmerText`), dựng
 * bằng `react-native-svg` (dải gradient ngang) + Reanimated (dịch + nghiêng trên luồng UI).
 *
 * ```tsx
 * <View className="overflow-hidden rounded-full">
 *   <Button fullWidth label="Đăng nhập" onPress={submit} />
 *   <ShimmerSweep className="rounded-full" delay={600} />
 * </View>
 * ```
 *
 * ⛔ Đặt SAU bề mặt (anh em vẽ sau nằm trên) trong một cha `overflow-hidden` cùng bo góc — không thì dải sáng lòi ra ngoài.
 * ⛔ Không ăn cú chạm (`pointerEvents="none"`), ẩn khỏi trình đọc màn hình. "Giảm chuyển động" ⇒ không quét.
 * ⚠️ Trắng trên nền SÁNG gần như vô hình — dùng trên bề mặt ĐẬM/tông (nút chính, thẻ `surface-*`, huy hiệu), hoặc đổi `tone`.
 */
export function ShimmerSweep({
  active = true,
  className,
  delay = 0,
  loop = false,
  strength = 0.35,
  tone = 'white-10',
}: ShimmerSweepProps) {
  const colors = useThemeColors();
  const id = `sweep-${useId().replace(/:/g, '')}`;
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);
  const progress = useLoopProgress({
    active: active && size !== null,
    delay,
    duration: MOTION_LOOP.sweep,
    once: !loop,
    rest: loop ? MOTION_LOOP.sweepRest : 0,
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setSize((prev) => (prev?.width === width && prev.height === height ? prev : { height, width }));
  };

  const band = size ? Math.max(size.width * BAND_RATIO, BAND_MIN) : BAND_MIN;
  const travel = size ? size.width + band * 2 : 0;

  // 0 ⇒ dải nằm hẳn NGOÀI mép trái; 1 ⇒ hẳn ngoài mép phải. Đứng yên (0 hoặc 1) thì không thấy gì — đúng ý "một lần".
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -band * 1.5 + travel * progress.get() }, { skewX: '-20deg' }],
  }));

  return (
    <View
      accessibilityElementsHidden
      className={cn('absolute inset-0 overflow-hidden', className)}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      onLayout={onLayout}
    >
      {size ? (
        // ⛔ `cssInterop={false}`: mảng [khung tĩnh, handle hoạt ảnh] — NativeWind gộp là mất khung (dải sáng cao 0).
        <Animated.View
          cssInterop={false}
          style={[
            {
              height: size.height * 1.6,
              left: 0,
              position: 'absolute',
              top: -size.height * 0.3,
              width: band,
            },
            style,
          ]}
        >
          <Svg height="100%" width="100%">
            <Defs>
              <LinearGradient id={id} x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor={colors[tone]} stopOpacity={0} />
                <Stop offset="0.5" stopColor={colors[tone]} stopOpacity={strength} />
                <Stop offset="1" stopColor={colors[tone]} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect fill={`url(#${id})`} height="100%" width="100%" x="0" y="0" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
