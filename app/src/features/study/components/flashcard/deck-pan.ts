import { Gesture } from 'react-native-gesture-handler';
import { withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tickHaptic } from './card-haptics';
import { decideSwipe, swipeThreshold, type SwipeDecision } from './flashcard-swipe';

/** Vuốt ngang quá chừng này (dp) mới nhận cử chỉ... */
const ACTIVATE_X = 12;
/** ...còn kéo dọc quá chừng này TRƯỚC thì nhường cho cuộn (mặt thẻ dài tự cuộn được). */
const FAIL_Y = 24;
/** Thẻ đi theo ngón tay theo chiều dọc chỉ một phần nhỏ — đủ "có trọng lượng", không lệch khỏi trục vuốt. */
const Y_FOLLOW = 0.2;
const SNAP_SPRING = { damping: 22, stiffness: 260 } as const;

export interface DeckPanState {
  busy: SharedValue<boolean>;
  crossed: SharedValue<boolean>;
  reduceMotion: boolean;
  width: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
}

/**
 * Pan của bộ bài (chạy trên luồng UI). Tách khỏi `useDeckSwipe` cho ≤ 150 dòng — và vì đây là phần chỉ có worklet, không có React.
 * `flyOut` là worklet của hook (bay ra rồi mới chấm, hoặc chấm ngay khi giảm chuyển động).
 *
 * ⚠️ Destructure `state` NGAY ĐẦU: worklet chỉ chụp đúng những biến nó nhắc tới; chụp cả object `state` là bắt Reanimated sao chép
 * mọi thứ trong đó mỗi lần dựng cử chỉ.
 */
export function createDeckPan(
  state: DeckPanState,
  flyOut: (decision: Exclude<SwipeDecision, null>) => void,
  enabled: boolean,
) {
  const { busy, crossed, reduceMotion, width, x, y } = state;

  return Gesture.Pan()
    .withTestId('flashcard-deck-pan')
    .enabled(enabled)
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onStart(() => {
      'worklet';
      crossed.set(false);
    })
    .onUpdate((event) => {
      'worklet';
      if (busy.get()) return;
      x.set(event.translationX);
      y.set(reduceMotion ? 0 : event.translationY * Y_FOLLOW);
      const past = Math.abs(event.translationX) >= swipeThreshold(width.get());
      if (past !== crossed.get()) {
        crossed.set(past);
        // Rung nhẹ đúng lúc kéo QUA ngưỡng (thả ra là chấm) và cả lúc kéo LÙI về — người dùng cảm được ranh giới.
        scheduleOnRN(tickHaptic);
      }
    })
    .onEnd((event) => {
      'worklet';
      if (busy.get()) return;
      const decision = decideSwipe(event.translationX, event.velocityX, width.get());
      if (decision !== null) {
        flyOut(decision);
        return;
      }
      x.set(reduceMotion ? 0 : withSpring(0, SNAP_SPRING));
      y.set(reduceMotion ? 0 : withSpring(0, SNAP_SPRING));
    })
    .onFinalize((_event, success) => {
      'worklet';
      // Bị ngắt (cuộc gọi đến, mất focus) khi chưa quyết định: đưa thẻ về, đừng để nó lơ lửng lệch một bên.
      if (!success && !busy.get()) {
        x.set(0);
        y.set(0);
      }
    });
}
