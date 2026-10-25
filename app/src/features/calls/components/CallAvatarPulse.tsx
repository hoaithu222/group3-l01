import { memo, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '@/shared/theme';

const RING_COUNT = 3;
/** Chu kỳ một vòng — chậm rãi kiểu "đổ chuông", không phải cảnh báo cần giật mình. */
const CYCLE_MS = 2400;
/** Vòng nở tối đa gấp 1.9 lần avatar — cũng là kích thước khung chứa (tránh vòng bị hàng xóm che). */
const MAX_SCALE = 1.9;
const PEAK_OPACITY = 0.35;

interface PulseRingProps {
  /** Lệch pha so với vòng đầu — ba vòng khởi động so le đều nhau trong một chu kỳ. */
  delayMs: number;
  ringColor: string;
  /** Đường kính avatar — vòng bắt đầu đúng bằng cỡ này rồi nở ra `MAX_SCALE`. */
  size: number;
}

/**
 * Một vòng sóng. Tách khỏi `CallAvatarPulse` để mỗi vòng gọi `useSharedValue`/`useAnimatedStyle` của
 * CHÍNH NÓ — gọi ba lần hook đó trong một vòng `for`/`map` của cùng một component là thứ ESLint
 * (`react-hooks/rules-of-hooks`) không cho phép, kể cả khi số lần luôn cố định.
 */
function PulseRing({ delayMs, ringColor, size }: PulseRingProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Component này chỉ được mount khi cha đã quyết định "đang chạy" (xem `CallAvatarPulse`), nên ở
    // đây chỉ cần start — dọn khi unmount là đủ, không cần thêm một cờ bật/tắt nữa.
    progress.set(
      withDelay(delayMs, withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.out(Easing.quad) }), -1, false)),
    );
    return () => {
      cancelAnimation(progress);
      progress.set(0);
    };
  }, [delayMs, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * PEAK_OPACITY,
    transform: [{ scale: 1 + progress.value * (MAX_SCALE - 1) }],
  }));

  return (
    <Animated.View
      cssInterop={false}
      pointerEvents="none"
      style={[
        {
          borderColor: ringColor,
          borderRadius: size / 2,
          borderWidth: 2,
          height: size,
          position: 'absolute',
          width: size,
        },
        style,
      ]}
    />
  );
}

export interface CallAvatarPulseProps {
  /**
   * `true` = đang đổ chuông/đang kết nối → ba vòng lan toả quanh avatar. `false` = đứng yên (đã vào
   * cuộc gọi thật) — animation liên tục suốt cuộc gọi chỉ tổ rối mắt và hao pin vô ích, vì lúc đó
   * người dùng đã nhìn thấy hình/nghe thấy tiếng đối phương rồi, "đang gọi" không còn là tin cần báo.
   */
  active: boolean;
  children: ReactNode;
  /** Đường kính avatar bên trong (dp) — dùng để tính khung chứa và cỡ vòng ban đầu. */
  size: number;
}

/**
 * Vòng sóng lan toả quanh avatar lúc đổ chuông — cảm hứng từ `CallAvatarPulse` của app chat cuộc họp
 * (3 vòng lệch pha đều nhau, chạy trên UI thread nên không giật khi JS thread bận xử lý tín hiệu
 * cuộc gọi). Ở đây chuyển từ `Animated` gốc sang Reanimated cho khớp phần còn lại của app (mọi hoạt
 * ảnh khác trong repo — `PulseHalo`, `WaitingPulse`, `LevelUpConfetti`… — đều dùng Reanimated).
 *
 * TẮT hoàn toàn (không render vòng nào, không chạy hook animation) khi:
 *  · `active={false}` — do màn gọi truyền vào theo pha cuộc gọi (`CallScreen` → `ringing`);
 *  · hệ thống bật "Giảm chuyển động" (`useReducedMotion`) — vòng sóng chỉ là trang trí, tên + dòng
 *    trạng thái chữ ("Đang gọi…"/"Cuộc gọi ... đến") đã nói đủ nghĩa mà không cần chuyển động.
 */
export const CallAvatarPulse = memo(function CallAvatarPulse({ active, children, size }: CallAvatarPulseProps) {
  const reduceMotion = useReducedMotion();
  // Tra qua bracket, KHÔNG gọi `useThemeColor('border-white')`: viết thẳng literal đó làm đối số hàm
  // khiến `check:classes` đọc nhầm thành một class Tailwind chết (namespace `border` có thật, chỉ là
  // token này không sinh ra ở dạng trần) — bracket là lối thoát đã có sẵn trong chính bộ lọc của nó
  // (xem `check-classes.mjs`, ca `colors['bg-nav']`).
  const ringColor = useThemeColors()['border-white'];
  const running = active && !reduceMotion;
  const box = size * MAX_SCALE;

  return (
    <View className="items-center justify-center" style={{ height: box, width: box }}>
      {running
        ? Array.from({ length: RING_COUNT }, (_, i) => (
            <PulseRing key={i} delayMs={(i * CYCLE_MS) / RING_COUNT} ringColor={ringColor} size={size} />
          ))
        : null}
      {children}
    </View>
  );
});
