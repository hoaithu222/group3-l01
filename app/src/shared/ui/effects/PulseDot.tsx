import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { type ThemeColorKey, useThemeColors } from '@/shared/theme';

import { MOTION_LOOP } from '../motion/motion.tokens';
import { useLoopProgress } from './useLoopProgress';

export interface PulseDotProps {
  /** Tắt vòng toả khi màn bị che — chấm vẫn hiện. Mặc định bật. */
  active?: boolean;
  /**
   * Nhãn cho trình đọc màn hình ("Đang diễn ra"). ⚠️ Bỏ trống ⇒ chấm là TRANG TRÍ (ẩn) — chỉ khi chữ bên cạnh đã nói
   * trạng thái. Chấm màu KHÔNG được là dấu hiệu duy nhất của trạng thái.
   */
  label?: string;
  /** Đường kính chấm (dp); vòng toả rộng gấp 2.6. */
  size?: number;
  /** Màu — token vai trò. Mặc định `error` (đỏ "LIVE" — đang diễn ra/đang ghi). `success` cho "đang trực tuyến". */
  tone?: ThemeColorKey;
}

/** Vòng toả nở tới 2.6× chấm rồi tan — to hơn thì lấn chữ bên cạnh trên hàng 44dp. */
const PULSE_SCALE = 2.6;

/**
 * Chấm "ĐANG DIỄN RA": chấm đặc + một vòng toả nở rồi tan theo nhịp — điểm nhấn cho cuộc họp/phòng/buổi học trực tiếp đang
 * chạy (cùng ý với quầng quét của `ui-smart/DataV-React` `decoration12`, bỏ phần radar). Khung giữ chỗ cố định
 * (`size × 2.6`) nên vòng toả KHÔNG làm hàng chữ bên cạnh xê dịch.
 *
 * ```tsx
 * <View className="flex-row items-center gap-2xs">
 *   <PulseDot />
 *   <Text className="text-label-sm font-semibold text-error">Đang diễn ra</Text>
 * </View>
 * ```
 *
 * ⚠️ Là một vòng lặp — tính vào quỹ "tối đa MỘT vòng lặp nổi bật mỗi màn" nếu chấm to; chấm nhỏ trong hàng thì chấp nhận
 * được, nhưng ⛔ đừng rải vào MỌI hàng của danh sách dài (mỗi chấm một hoạt ảnh).
 */
export function PulseDot({ active = true, label, size = 8, tone = 'error' }: PulseDotProps) {
  const colors = useThemeColors();
  const progress = useLoopProgress({ active, duration: MOTION_LOOP.pulse, still: 1 });
  const frame = size * PULSE_SCALE;

  const ring = useAnimatedStyle(() => {
    const p = progress.get();
    return { opacity: 0.55 * (1 - p), transform: [{ scale: 1 + (PULSE_SCALE - 1) * p }] };
  });

  return (
    <View
      accessibilityElementsHidden={!label}
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : undefined}
      accessible={Boolean(label)}
      className="items-center justify-center"
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{ height: frame, width: frame }}
    >
      {/* ⛔ `cssInterop={false}` + bọc KHUNG cố định: mảng [khung tĩnh, handle] để NativeWind gộp là vòng toả mất cỡ. */}
      <Animated.View
        cssInterop={false}
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, ring]}
      >
        <View
          style={{ backgroundColor: colors[tone], borderRadius: size, height: size, width: size }}
        />
      </Animated.View>
      <View
        style={{ backgroundColor: colors[tone], borderRadius: size, height: size, width: size }}
      />
    </View>
  );
}
