import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const INHALE_MS = 4000;
const HOLD_MS = 2000;
const EXHALE_MS = 4000;
const CYCLE_MS = INHALE_MS + HOLD_MS + EXHALE_MS;
const MIN_SCALE = 0.62;
const MAX_SCALE = 1;
/** Đủ mượt cho chữ đổi theo nhịp, không cần chạy mỗi khung hình (chữ, không phải hoạt hoạ). */
const TICK_MS = 250;
/** Cỡ vòng tròn — số thô vì nằm trên node `Animated.View` KHÔNG được mang `className` (xem chú thích ở chỗ vẽ). */
const CIRCLE_SIZE = { height: 180, width: 180 } as const;

export type BreathPhase = 'INHALE' | 'HOLD' | 'EXHALE';

const PHASE_LABEL: Record<BreathPhase, string> = {
  INHALE: 'Hít vào',
  HOLD: 'Giữ',
  EXHALE: 'Thở ra',
};

function phaseAt(elapsedMs: number): BreathPhase {
  const t = elapsedMs % CYCLE_MS;
  if (t < INHALE_MS) return 'INHALE';
  if (t < INHALE_MS + HOLD_MS) return 'HOLD';
  return 'EXHALE';
}

export interface BreathingAnimationProps {
  /** `false` = đứng yên (đã bấm Dừng/hết giờ) — không đổi chữ, không chạy vòng tròn. */
  running: boolean;
}

/**
 * Vòng tròn hít vào (4 giây) → giữ (2 giây) → thở ra (4 giây), lặp lại (TakeABreakWidget, p7-03 P1). "Giảm chuyển động"
 * (`useReducedMotion`) → KHÔNG có vòng tròn, chỉ còn chữ đổi theo đúng nhịp (app.md §7 "Reduce motion: hít thở dạng đếm chữ") — chữ là
 * nguồn thông tin CHÍNH ở cả hai chế độ, vòng tròn chỉ là minh hoạ thêm khi được phép chuyển động.
 */
export function BreathingAnimation({ running }: BreathingAnimationProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(MIN_SCALE);
  const [phase, setPhase] = useState<BreathPhase>('INHALE');

  // Chữ đổi theo nhịp — tính từ mốc THỜI GIAN THỰC (không cộng dồn từng bước): tránh trôi nhịp nếu JS thread bận một lát.
  // ⚠️ Không `setPhase` đồng bộ trong THÂN effect (luật `set-state-in-effect` — vẽ lại dây chuyền): nhịp đầu đã là `INHALE`
  // (state khởi tạo = `phaseAt(0)`), còn việc về lại nhịp đầu khi dừng nằm ở hàm DỌN của lần chạy trước.
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const id = setInterval(() => setPhase(phaseAt(Date.now() - startedAt)), TICK_MS);
    return () => {
      clearInterval(id);
      setPhase('INHALE');
    };
  }, [running]);

  useEffect(() => {
    if (!running || reduceMotion) {
      scale.set(withTiming(MIN_SCALE, { duration: 300 }));
      return;
    }
    scale.set(
      withRepeat(
        withSequence(
          withTiming(MAX_SCALE, { duration: INHALE_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(MAX_SCALE, { duration: HOLD_MS }),
          withTiming(MIN_SCALE, { duration: EXHALE_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
  }, [running, reduceMotion, scale]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const label = PHASE_LABEL[phase];

  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessible
      className="items-center gap-lg py-xl"
    >
      {reduceMotion ? null : (
        // ⛔ Node mang `useAnimatedStyle` KHÔNG mang `className` và phải `cssInterop={false}` (styling-nativewind.md "Cạm bẫy"):
        // NativeWind gộp class + handle hoạt ảnh thành một object, Reanimated chỉ lấy `initial.value` ⇒ rơi cỡ/nền, vòng
        // tròn biến mất không lỗi nào báo. Màu/bo góc ở `View` thường bên trong.
        <Animated.View cssInterop={false} style={[CIRCLE_SIZE, circleStyle]}>
          <View className="flex-1 items-center justify-center rounded-full border-hairline border-border-brand-subtle bg-surface-primary">
            {/* Lõi đậm hơn ở tâm (co giãn cùng vòng) — điểm neo cho mắt bám theo nhịp thở, vòng không còn là một mảng màu phẳng. */}
            <View className="size-5xl rounded-full bg-action-tint-strong" />
          </View>
        </Animated.View>
      )}
      <Text className="text-header-lg font-semibold text-fg-1">{label}</Text>
    </View>
  );
}
