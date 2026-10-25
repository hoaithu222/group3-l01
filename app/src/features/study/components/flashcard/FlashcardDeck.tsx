import type { ReactNode } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeOutLeft, useReducedMotion } from 'react-native-reanimated';

import { PeekLayer } from './PeekLayer';
import { RiseIn } from './RiseIn';
import { SwipeOverlay } from './SwipeOverlay';
import type { DeckSwipe } from './useDeckSwipe';

const FILL = { flex: 1 } as const;
/** Thẻ vừa chấm trượt sang trái + mờ đi (ôn theo lịch). Ngắn hơn hiệu ứng vào để nhịp chấm liên tục không bị kéo dài. */
const EXIT_MS = 160;

export interface FlashcardDeckProps {
  /** Thẻ đang học. */
  children: ReactNode;
  /** Khoá thẻ (id) — đổi là thẻ mới vào bằng hiệu ứng "trồi lên". */
  cardKey: string;
  /** Số thẻ CÒN LẠI sau thẻ này — quyết định có mấy lớp lấp ló (tối đa 2). */
  remaining: number;
  /** Có ⇒ thẻ vuốt được (Học thẻ). Không ⇒ chỉ xếp chồng + hiệu ứng vào/ra (Ôn theo lịch: cần chấm 4 mức nên không vuốt). */
  swipe?: DeckSwipe;
}

/**
 * Bộ bài: thẻ đang học ở trên cùng, tối đa hai lớp "thẻ kế tiếp" lấp ló phía sau, và (khi có `swipe`) cử chỉ vuốt + lớp phủ
 * "Đã thuộc"/"Chưa thuộc". Thẻ, lớp phủ và cử chỉ nằm chung MỘT `Animated.View` để cùng đi theo ngón tay.
 *
 * ── Thẻ RA ───────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Học thẻ: thẻ tự bay ra mép khi chấm (`useDeckSwipe`) nên không cần gì thêm. Ôn theo lịch (không `swipe`): chấm xong là sang thẻ
 * kế NGAY (không chờ mạng, không chờ hoạt cảnh), nên thẻ cũ được Reanimated GIỮ LẠI thêm 160 ms để trượt trái + mờ đi
 * (`exiting`) trong lúc thẻ mới trồi lên — không có bản sao thẻ nào do mình dựng. `Giảm chuyển động` ⇒ không `exiting`.
 * ⚠️ `exiting` chỉ có ý nghĩa trên máy (Jest không có luồng UI) — chưa thấy trên máy thật.
 *
 * `pb-lg` chừa chỗ cho dải lấp ló phía dưới (`PeekLayer` co quanh mép dưới nên dải ló ra đúng bằng độ dịch của lớp). `flex-1` để
 * bộ bài lấy hết chỗ giữa tiến độ và điều khiển — thẻ tự co theo chiều cao (mặt thẻ dài thì tự cuộn trong thẻ).
 *
 * ⛔ `Animated.View` không mang `className`; chỉ `View` thường mới có (xem `shared/ui/AGENTS.md`).
 */
export function FlashcardDeck({ cardKey, children, remaining, swipe }: FlashcardDeckProps) {
  const reduceMotion = useReducedMotion();
  const card = (
    <>
      <RiseIn key={cardKey} fill>
        {children}
      </RiseIn>
      {swipe ? (
        <>
          <SwipeOverlay side="known" width={swipe.width} x={swipe.x} />
          <SwipeOverlay side="unknown" width={swipe.width} x={swipe.x} />
        </>
      ) : null}
    </>
  );

  return (
    <View className="min-h-40 flex-1 pb-lg" onLayout={swipe?.onLayout}>
      <View className="flex-1">
        {remaining >= 2 ? <PeekLayer depth={2} width={swipe?.width} x={swipe?.x} /> : null}
        {remaining >= 1 ? <PeekLayer depth={1} width={swipe?.width} x={swipe?.x} /> : null}
        {swipe ? (
          <GestureDetector gesture={swipe.gesture}>
            <Animated.View cssInterop={false} style={[FILL, swipe.cardStyle]}>
              {card}
            </Animated.View>
          </GestureDetector>
        ) : (
          <Animated.View
            key={cardKey}
            cssInterop={false}
            exiting={reduceMotion ? undefined : FadeOutLeft.duration(EXIT_MS)}
            style={FILL}
          >
            {card}
          </Animated.View>
        )}
      </View>
    </View>
  );
}
