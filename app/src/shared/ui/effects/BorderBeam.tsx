import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion } from 'react-native-reanimated';
import { Rect, Svg } from 'react-native-svg';

import { RADIUS, type ThemeColorKey, useThemeColors } from '@/shared/theme';
import { cn } from '@/shared/utils/style/cn';

import { MOTION_LOOP } from '../motion/motion.tokens';
import { useLoopProgress } from './useLoopProgress';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** Đoạn sáng dài 18% chu vi — ngắn quá thì chỉ là một chấm chạy, dài quá thì thành viền nhấp nháy. */
const BEAM_RATIO = 0.18;

export interface BorderBeamProps {
  /** Tắt khi màn bị che (tab khác) — lúc đó chỉ còn viền tĩnh nhạt. Mặc định bật. */
  active?: boolean;
  children: ReactNode;
  /** Lớp của KHUNG bọc (bố cục + hình thức của thẻ: `rounded-md bg-bg-1 p-md`…). */
  className?: string;
  /** Bo góc (dp) — ⛔ PHẢI khớp `rounded-*` của thẻ (`RADIUS.md` = 24 cho `rounded-md`), không thì tia chạy lệch mép. */
  radius?: number;
  /** Màu tia — token. Mặc định `fg-brand` (tím đậm ở sáng, tím sáng ở tối). `action-accent` (vàng) cho "phần thưởng". */
  tone?: ThemeColorKey;
  testID?: string;
  /** Bề dày tia (dp). */
  width?: number;
}

/**
 * Thẻ có một TIA SÁNG chạy vòng quanh viền — điểm nhấn cho đúng MỘT thẻ "đang chờ bạn" trên màn: ôn tập đến hạn, buổi học
 * hôm nay, phòng đang diễn ra, phần thưởng nhận được. Ý tưởng từ `ui-smart/DataV-React` (`borderBox8`) và
 * `ui-mobile/flutterfx_widgets` (`BorderBeam`), dựng lại bằng `react-native-svg` + Reanimated (luồng UI).
 *
 * ```tsx
 * <BorderBeam active={isFocused} className="rounded-md bg-bg-1 p-md" radius={RADIUS.md}>
 *   <SrDueCardBody … />
 * </BorderBeam>
 * ```
 *
 * ── Cách vẽ ────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Một hình chữ nhật bo góc đè lên viền thẻ, nét đứt [tia, phần còn lại của chu vi]; `strokeDashoffset` trượt −chu vi mỗi vòng
 * ⇒ tia chạy theo đúng đường viền, kể cả qua góc bo. Hai lớp cùng nhịp: lớp rộng mờ (quầng) + lớp mảnh đậm (lõi).
 * Chu vi hình bo góc = 2(W + H) − 8r + 2πr.
 *
 * ⛔ Mỗi màn TỐI ĐA MỘT vòng lặp nổi bật (`MOTION_LOOP`). "Giảm chuyển động"/`active={false}` ⇒ chỉ còn viền tĩnh nhạt
 * cùng tông (thẻ vẫn được đánh dấu, không có gì chạy). Lớp vẽ ẩn khỏi trình đọc màn hình, không ăn cú chạm.
 */
export function BorderBeam({
  active = true,
  children,
  className,
  radius = RADIUS.md,
  testID,
  tone = 'fg-brand',
  width = 1.5,
}: BorderBeamProps) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);
  const progress = useLoopProgress({ active, duration: MOTION_LOOP.beam });

  const onLayout = (event: LayoutChangeEvent) => {
    const { height, width: w } = event.nativeEvent.layout;
    setSize((prev) => (prev?.width === w && prev.height === height ? prev : { height, width: w }));
  };

  // Hình vẽ lùi vào nửa nét để nét nằm TRỌN trong thẻ (không bị `overflow-hidden` của thẻ cắt mất nửa ngoài).
  const rectW = size ? Math.max(size.width - width, 0) : 0;
  const rectH = size ? Math.max(size.height - width, 0) : 0;
  const r = Math.max(Math.min(radius - width / 2, rectW / 2, rectH / 2), 0);
  const perimeter = 2 * (rectW + rectH) - 8 * r + 2 * Math.PI * r;
  const beam = perimeter * BEAM_RATIO;
  const moving = active && !reduceMotion;

  const glowProps = useAnimatedProps(() => ({ strokeDashoffset: -perimeter * progress.get() }));
  const coreProps = useAnimatedProps(() => ({ strokeDashoffset: -perimeter * progress.get() }));

  const rect = { height: rectH, rx: r, ry: r, width: rectW, x: width / 2, y: width / 2 };

  return (
    <View className={cn('relative', className)} testID={testID} onLayout={onLayout}>
      {children}
      {size ? (
        <View
          accessibilityElementsHidden
          className="absolute inset-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <Svg height={size.height} width={size.width}>
            {/* Viền nền nhạt: đứng yên thì chính nó là dấu hiệu "thẻ này đáng chú ý". */}
            <Rect
              {...rect}
              fill="none"
              stroke={colors[tone]}
              strokeOpacity={moving ? 0.18 : 0.45}
              strokeWidth={width}
            />
            {moving ? (
              <>
                <AnimatedRect
                  {...rect}
                  animatedProps={glowProps}
                  fill="none"
                  stroke={colors[tone]}
                  strokeDasharray={[beam, perimeter - beam]}
                  strokeLinecap="round"
                  strokeOpacity={0.25}
                  strokeWidth={width * 4}
                />
                <AnimatedRect
                  {...rect}
                  animatedProps={coreProps}
                  fill="none"
                  stroke={colors[tone]}
                  strokeDasharray={[beam, perimeter - beam]}
                  strokeLinecap="round"
                  strokeWidth={width}
                />
              </>
            ) : null}
          </Svg>
        </View>
      ) : null}
    </View>
  );
}
