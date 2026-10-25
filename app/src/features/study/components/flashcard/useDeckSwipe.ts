import { useEffect } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { commitHaptic } from './card-haptics';
import { createDeckPan } from './deck-pan';
import { flyOutDistance, tiltDegrees, type SwipeDecision } from './flashcard-swipe';

const FLY_OUT_MS = 200;

export interface DeckSwipeOptions {
  /**
   * Đổi ⇒ thẻ mới: xả trạng thái kéo/bay của thẻ cũ (thẻ mới hiện ở giữa, không còn nằm ngoài mép). Dùng id thẻ; hết phiên thì
   * truyền một khoá cố định khác mọi id (vd `'end'`).
   */
  cardKey: string;
  /** Chấm xong (`true` = đã thuộc). Chạy trên luồng JS, SAU khi thẻ bay khỏi mép (hoặc NGAY khi tắt chuyển động). */
  onDecide: (known: boolean) => void;
  disabled?: boolean;
}

/**
 * Cử chỉ vuốt thẻ: sang PHẢI = "đã thuộc", sang TRÁI = "chưa thuộc" (Pan của gesture-handler — cấu hình ở `deck-pan.ts`).
 *
 * Thẻ đi theo ngón tay (+ nghiêng nhẹ); nhấc tay quá ngưỡng (`decideSwipe`) thì thẻ bay ra mép rồi mới gọi `onDecide`, chưa đủ thì
 * bật về chỗ cũ. `dismiss(...)` là đường cho NÚT (`FlashcardControls`) — cùng hiệu ứng bay, cùng một lối chấm, nên hai cách chấm
 * không thể lệch nhau. ⛔ Vuốt PHẢI luôn có nút thay thế (người dùng một tay/trình đọc màn hình) — nút nằm ở `FlashcardControls`.
 *
 * ── Kỷ luật hiệu năng + React Compiler ────────────────────────────────────────────────────────────────────────────
 * Mọi thứ đổi theo ngón tay là SHARED VALUE (không `setState` mỗi khung hình); chỉ `onDecide`/rung đi về luồng JS qua `scheduleOnRN`.
 * Chỉ dùng `.get()/.set()` (Compiler cấm ghi `.value` của giá trị hook trả về), không đọc shared value lúc VẼ.
 * `busy` chặn chấm đôi: bay ra là khoá tới khi thẻ đổi (`cardKey`).
 *
 * ⚠️ "Giảm chuyển động" bật ⇒ thẻ vẫn bám ngón tay (thao tác trực tiếp, không phải chuyển động tự chạy) nhưng KHÔNG nghiêng, KHÔNG lò
 * xo, KHÔNG bay: nhấc tay là chấm ngay. ⚠️ Chưa thử trên máy thật — cần kiểm vuốt vs cuộn mặt thẻ dài trên Android + iOS.
 */
export function useDeckSwipe({ cardKey, disabled = false, onDecide }: DeckSwipeOptions) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const busy = useSharedValue(false);
  const crossed = useSharedValue(false);

  useEffect(() => {
    x.set(0);
    y.set(0);
    busy.set(false);
    crossed.set(false);
  }, [busy, cardKey, crossed, x, y]);

  const commit = (decision: Exclude<SwipeDecision, null>) => {
    commitHaptic();
    onDecide(decision === 'known');
  };

  const flyOut = (decision: Exclude<SwipeDecision, null>) => {
    'worklet';
    busy.set(true);
    if (reduceMotion) {
      scheduleOnRN(commit, decision);
      return;
    }
    x.set(
      withTiming(
        flyOutDistance(decision, width.get()),
        { duration: FLY_OUT_MS, easing: Easing.out(Easing.quad) },
        (finished) => {
          'worklet';
          // `finished` false = thẻ đổi giữa chừng (bấm "Trước") ⇒ tuyệt đối không chấm thẻ vừa bị bỏ đi.
          if (finished) scheduleOnRN(commit, decision);
        },
      ),
    );
  };

  const gesture = createDeckPan({ busy, crossed, reduceMotion, width, x, y }, flyOut, !disabled);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { rotate: `${reduceMotion ? 0 : tiltDegrees(x.get(), width.get())}deg` },
    ],
  }));

  return {
    cardStyle,
    /** Đường của NÚT bấm: bay ra rồi chấm (hoặc chấm ngay khi giảm chuyển động). Đang bay dở thì bỏ qua. */
    dismiss: (decision: Exclude<SwipeDecision, null>) => {
      if (disabled || busy.get()) return;
      flyOut(decision);
    },
    gesture,
    onLayout: (event: LayoutChangeEvent) => width.set(event.nativeEvent.layout.width),
    width,
    x,
  };
}

export type DeckSwipe = ReturnType<typeof useDeckSwipe>;
