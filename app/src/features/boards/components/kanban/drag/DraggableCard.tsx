import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { TaskCardDto } from '../../../api/boards.types';
import { LONG_PRESS_MS } from '../../../constants/kanban.constants';
import { useDrag } from './drag-context';

/** Ngón tay phải dịch ít nhất chừng này (dp, Manhattan) mới báo về JS — cho tự cuộn, không cần mượt hơn. */
const MOVE_REPORT_DISTANCE = 6;

/**
 * Bọc một thẻ để kéo được: nhấn giữ 250 ms rồi kéo (`app.md` §2 `DraggableCard`).
 *
 * ── Vì sao `activateAfterLongPress` ─────────────────────────────────────────
 * Vuốt dọc/ngang khi CHƯA đủ 250 ms làm Pan thất bại ngay nên cuộn list và
 * pager vẫn chạy bằng native; chỉ khi giữ yên đủ lâu Pan mới nhận cử chỉ và thẻ
 * được nâng. Đây là điểm mấu chốt để pager ngang + list dọc lồng nhau không
 * tranh cử chỉ — ⚠️ CHƯA XÁC MINH trên thiết bị.
 *
 * ── React Compiler (kết luận tĩnh — bị `react-hooks/*` bắt lúc viết) ──────────
 * ESLint (bộ luật của Compiler) coi callback đưa vào `.onStart/.onUpdate` là hàm
 * có thể chạy TRONG LÚC VẼ, nên trong đó:
 *  1. ⛔ không gọi hàm không thuần như `Date.now()` (`react-hooks/purity`) → chặn
 *     tần suất báo bằng KHOẢNG DỊCH CHUYỂN, không bằng đồng hồ;
 *  2. ⛔ không đưa `ref` vào hàm, kể cả `measure(animatedRef)` của Reanimated
 *     (`react-hooks/refs`: "Passing a ref to a function may read its value during
 *     render"; chỉ thị `'use no memo'` KHÔNG tắt được luật này) → component KHÔNG
 *     tự đo. Hộp của thẻ do `DragProvider` suy từ `ColumnHandle.measure()` (vị
 *     trí thẻ theo `FlashList.getLayout` − độ cuộn), nên worklet chỉ mang số;
 *  3. dùng `.set()`/`.get()` chứ không `.value =` (`mutables.ts` của Reanimated:
 *     "React Compiler disallows modifying return values of hooks").
 *
 * Chỉ giá trị NGUYÊN THUỶ đi vào worklet — `task` chỉ nằm trong hàm JS `lift` (được
 * gọi qua `scheduleOnRN`, không bị sao chép sâu ở mỗi lần vẽ; một cột có 100–200 thẻ).
 *
 * Không có DragProvider hoặc `disabled` ⇒ trả lại `children` nguyên vẹn.
 */
export function DraggableCard({
  children,
  columnId,
  disabled = false,
  task,
}: {
  children: ReactNode;
  columnId: string;
  disabled?: boolean;
  task: TaskCardDto;
}) {
  const drag = useDrag();
  // Chỉ bắt các shared value vào worklet — bắt cả `drag` là kéo theo mọi hàm/state của provider.
  const shared = drag?.shared;
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);
  const active = useSharedValue(false);

  const lift = (x: number, y: number) => drag?.begin(task, columnId, { x, y });
  const reportMove = (x: number, y: number) => drag?.moved({ x, y });
  const drop = (x: number, y: number) => drag?.end({ x, y });
  const abort = () => drag?.cancel();

  const gesture = Gesture.Pan()
    .enabled(Boolean(drag?.enabled) && !disabled)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((event) => {
      'worklet';
      active.set(true);
      lastX.set(event.absoluteX);
      lastY.set(event.absoluteY);
      scheduleOnRN(lift, event.absoluteX, event.absoluteY);
    })
    .onUpdate((event) => {
      'worklet';
      if (!shared || !active.get()) return;
      shared.x.set(event.absoluteX);
      shared.y.set(event.absoluteY);
      const moved = Math.abs(event.absoluteX - lastX.get()) + Math.abs(event.absoluteY - lastY.get());
      if (moved >= MOVE_REPORT_DISTANCE) {
        lastX.set(event.absoluteX);
        lastY.set(event.absoluteY);
        scheduleOnRN(reportMove, event.absoluteX, event.absoluteY);
      }
    })
    .onEnd((event, success) => {
      'worklet';
      if (success && active.get()) scheduleOnRN(drop, event.absoluteX, event.absoluteY);
    })
    .onFinalize((_event, success) => {
      'worklet';
      // Chỉ báo huỷ khi cử chỉ ĐÃ nâng thẻ mà bị ngắt (cuộc gọi đến, mất focus…).
      if (active.get() && !success) scheduleOnRN(abort);
      active.set(false);
    });

  if (!drag) return <>{children}</>;

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false}>{children}</View>
    </GestureDetector>
  );
}
