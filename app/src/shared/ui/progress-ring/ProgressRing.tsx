import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useThemeColors, type ThemeColorKey } from '@/shared/theme';
import { tCommon } from '@/shared/utils/i18n';

/** Tông của vòng: màu phần đã chạy. Chỉ token vai trò `action-*` (đảo chiều đúng ở chế độ tối). */
export type ProgressRingTone = 'brand' | 'error' | 'success';

const TONE_COLOR: Record<ProgressRingTone, ThemeColorKey> = {
  brand: 'action-base',
  error: 'action-error',
  success: 'action-success',
};

/** Vòng quay một vòng mất bấy nhiêu ms khi `indeterminate`. */
const SPIN_DURATION_MS = 900;
/** Phần vòng tròn được vẽ khi `indeterminate` (một cung 25%). */
const INDETERMINATE_ARC = 0.25;

export interface ProgressRingProps {
  /**
   * Chạy liên tục khi chưa biết tiến độ (đang chuẩn bị, đang nén…). Đặt `progress` cũng bị bỏ qua. Vòng quay dừng ở dáng cung tĩnh
   * khi người dùng bật "Giảm chuyển động" của hệ điều hành — tự động, không cần nơi gọi lo.
   */
  animated?: boolean;
  /** Nội dung ở TÂM vòng — nút huỷ, biểu tượng, chữ phần trăm. ⚠️ Phải vừa trong `size − 2×strokeWidth`. */
  children?: ReactNode;
  className?: string;
  indeterminate?: boolean;
  /** Nhãn cho trình đọc màn hình. Mặc định "Đang tải…" (kèm phần trăm khi biết tiến độ, qua `accessibilityValue`). */
  label?: string;
  /** Tiến độ 0..1 (ngoài khoảng bị kẹp lại; `NaN` = 0). */
  progress?: number;
  /** Đường kính (dp). Mặc định 32. */
  size?: number;
  /** Bề dày nét (dp). Mặc định ~1/8 đường kính, tối thiểu 2. */
  strokeWidth?: number;
  tone?: ProgressRingTone;
}

/**
 * Vòng tiến độ tròn (react-native-svg) — tải lên/tải xuống, chuẩn bị, nén ảnh (p0-12). Dùng khi CHỖ HẸP (thẻ tệp, nút): thanh
 * ngang một tệp là `AttachmentProgress`; dòng thời gian nhiều bước là `Progress`.
 *
 * ```tsx
 * <ProgressRing progress={0.45} label="Đang tải lên báo cáo.pdf" />
 * <ProgressRing indeterminate size={24} />
 * <ProgressRing progress={p} size={40}><Icon name="cancel" size={16} /></ProgressRing>
 * ```
 *
 * ⚠️ Màu vẽ bằng SVG nên đi qua `useThemeColors()` (token → mã màu theo chế độ sáng/tối), ⛔ không truyền mã hex. Nền vòng
 * (`bg-3`) là đường mờ; phần đã chạy là `action-base`/`action-success`/`action-error`.
 */
export function ProgressRing({
  animated = true,
  children,
  className,
  indeterminate = false,
  label,
  progress = 0,
  size = 32,
  strokeWidth,
  tone = 'brand',
}: ProgressRingProps) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const spinning = indeterminate && animated && !reduceMotion;

  useEffect(() => {
    if (!spinning) {
      cancelAnimation(rotation);
      rotation.set(0);
      return undefined;
    }
    rotation.set(
      withRepeat(withTiming(360, { duration: SPIN_DURATION_MS, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(rotation);
  }, [rotation, spinning]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${String(rotation.get())}deg` }] }));

  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const percent = Math.round(clamped * 100);
  const stroke = strokeWidth ?? Math.max(2, Math.round(size / 8));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const arc = indeterminate ? INDETERMINATE_ARC : clamped;

  return (
    <View
      accessibilityLabel={label ?? tCommon('state.loading')}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: indeterminate }}
      accessibilityValue={indeterminate ? undefined : { max: 100, min: 0, now: percent }}
      accessible
      className={className}
      style={{ height: size, width: size }}
    >
      {/* Animated.View KHÔNG mang className (xem `shared/ui/AGENTS.md`): style truyền thẳng, khung ngoài mới có class.
          ⛔ `cssInterop={false}`: thiếu nó NativeWind gộp mảng style, Reanimated bỏ mất khung `size` lúc đang quay. */}
      <Animated.View cssInterop={false} style={[{ height: size, width: size }, spinning ? spinStyle : null]}>
        <Svg height={size} width={size}>
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={colors['bg-3']}
            strokeWidth={stroke}
          />
          {arc > 0 ? (
            <Circle
              cx={center}
              cy={center}
              fill="none"
              originX={center}
              originY={center}
              r={radius}
              rotation={-90}
              stroke={colors[TONE_COLOR[tone]]}
              strokeDasharray={`${String(circumference * arc)} ${String(circumference)}`}
              strokeLinecap="round"
              strokeWidth={stroke}
            />
          ) : null}
        </Svg>
      </Animated.View>
      {children ? (
        // Nội dung ở tâm không quay theo vòng (nằm ngoài `Animated.View`).
        <View
          className="absolute inset-0 items-center justify-center"
          pointerEvents="box-none"
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}
