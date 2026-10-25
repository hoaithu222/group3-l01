import * as Haptics from 'expo-haptics';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { LONG_PRESS_MS } from '../constants/kanban.constants';
import type { GanttDragMode } from '../utils/gantt-shift';

interface Options {
  /** Tắt kéo (chỉ đọc: offline, bảng lưu trữ, không quyền) — chạm vẫn mở được. */
  enabled: boolean;
  dayWidth: number;
  /** Số ngày TỐI ĐA được rút ngắn khi kéo mép phải = độ dài thanh − 1 (thanh không co dưới một ngày). */
  maxShrinkDays: number;
  /** Bề rộng thanh lúc chưa kéo (dp). */
  width: number;
  /** Gọi MỘT lần khi thả, `days ≠ 0`. Thanh về chỗ cũ ngay; dữ liệu mới về thì nó nhảy sang chỗ mới. */
  onCommit: (mode: GanttDragMode, days: number) => void;
}

/**
 * Cử chỉ kéo thanh Gantt (app.md §5 "Reanimated shared values, `runOnJS` khi thả"): nhấn giữ 250 ms rồi kéo — vuốt
 * ngang khi CHƯA đủ 250 ms làm Pan thất bại nên cuộn ngang của biểu đồ vẫn chạy (cùng cơ chế `DraggableCard`,
 * ⚠️ CHƯA xác minh trên thiết bị). Vị trí bám ngón tay theo TỪNG NGÀY (làm tròn `translationX / dayWidth`) và rung nhẹ
 * mỗi khi chạm một mốc ngày mới — người dùng thấy rõ thanh sẽ rơi vào ngày nào.
 *
 * React Compiler: chỉ dùng `.get()/.set()` (không `.value`), không `Date.now()` hay ref trong worklet; chỉ số nguyên
 * thuỷ đi vào worklet, hàm JS (`tick`, `commit`) qua `scheduleOnRN`.
 * ⛔ `Animated.View` dùng `animatedStyle` KHÔNG được mang `className` (NativeWind làm rơi style) — nơi dùng bọc phần nhìn
 * thấy bằng `View className` bên trong.
 */
export function useGanttBarGestures({ dayWidth, enabled, maxShrinkDays, width, onCommit }: Options) {
  const offsetX = useSharedValue(0);
  const growX = useSharedValue(0);
  const lastSnap = useSharedValue(0);

  const tick = () => void Haptics.selectionAsync();
  const commit = (mode: GanttDragMode, days: number) => onCommit(mode, days);

  const move = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      'worklet';
      lastSnap.set(0);
    })
    .onUpdate((event) => {
      'worklet';
      const snapped = Math.round(event.translationX / dayWidth);
      offsetX.set(snapped * dayWidth);
      if (snapped !== lastSnap.get()) {
        lastSnap.set(snapped);
        scheduleOnRN(tick);
      }
    })
    .onEnd((event, success) => {
      'worklet';
      const days = Math.round(event.translationX / dayWidth);
      if (success && days !== 0) scheduleOnRN(commit, 'move', days);
    })
    .onFinalize(() => {
      'worklet';
      offsetX.set(0);
    });

  const resize = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      'worklet';
      lastSnap.set(0);
    })
    .onUpdate((event) => {
      'worklet';
      const snapped = Math.max(-maxShrinkDays, Math.round(event.translationX / dayWidth));
      growX.set(snapped * dayWidth);
      if (snapped !== lastSnap.get()) {
        lastSnap.set(snapped);
        scheduleOnRN(tick);
      }
    })
    .onEnd((event, success) => {
      'worklet';
      const days = Math.max(-maxShrinkDays, Math.round(event.translationX / dayWidth));
      if (success && days !== 0) scheduleOnRN(commit, 'resize', days);
    })
    .onFinalize(() => {
      'worklet';
      growX.set(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.get() }],
    width: width + growX.get(),
  }));

  return { animatedStyle, move, resize };
}
