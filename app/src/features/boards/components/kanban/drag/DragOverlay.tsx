import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/shared/ui/icon';

import type { BoardColumn, BoardLabel } from '../../../api/boards.types';
import { dropReviewHint } from '../../../utils/review-chip';
import { TaskCardMini } from '../TaskCardMini';
import { useDrag } from './drag-context';

const NOOP = () => undefined;

/** Thẻ nâng cao hơn nền một chút — không bóng (Android vẽ `elevation` sai trên nền trong suốt, xem `card.styles.ts`). */
const LIFT_SCALE = 1.03;

/**
 * Bản sao thẻ nổi theo ngón tay (`app.md` §2 `DragOverlay`).
 *
 * ⛔ `Animated.View` KHÔNG mang `className`: NativeWind gộp class và `style` vào
 * một object mà Reanimated coi là handle animation, làm mất hết style từ class
 * (`src/shared/ui/AGENTS.md` mục "Chuyển động"). Ở đây `Animated.View` chỉ có
 * `style`, phần nhìn thấy nằm trong `View className` lồng bên trong.
 *
 * Tôn trọng "giảm chuyển động": bỏ hiệu ứng phóng to, thẻ vẫn bám ngón tay.
 */
export function DragOverlay({
  columns,
  labels,
}: {
  columns: readonly BoardColumn[];
  labels: ReadonlyMap<string, BoardLabel>;
}) {
  const drag = useDrag();
  const reduceMotion = useReducedMotion();
  // Chỉ đưa các shared value vào worklet (cùng lý do `DraggableCard`): bắt cả `drag` là sao chép sang luồng UI cả thẻ đang kéo và
  // mọi hàm của provider mỗi lần ngữ cảnh đổi — vd mỗi lần ngón tay sang cột khác.
  const shared = drag?.shared;

  const animatedStyle = useAnimatedStyle(() => {
    if (!shared) return { opacity: 0 };
    const { grabX, grabY, originX, originY, visible, x, y } = shared;
    return {
      opacity: visible.get(),
      transform: [
        { translateX: x.get() - originX.get() - grabX.get() },
        { translateY: y.get() - originY.get() - grabY.get() },
        { scale: reduceMotion ? 1 : LIFT_SCALE },
      ],
    };
  });

  if (!drag?.session) return null;
  const { task, width } = drag.session;
  const columnTitle = columns.find((column) => column.id === task.columnId)?.title ?? '';
  // p4-05: lướt qua cột Hoàn thành với thẻ chưa đủ duyệt → nhắc ngay dưới thẻ đang kéo (chỉ gợi ý; thả vẫn gửi, server quyết).
  const hover = columns.find((column) => column.id === drag.hoverColumnId);
  const hint = dropReviewHint(task.reviewState, hover?.kind, hover?.id === task.columnId);

  return (
    <Animated.View cssInterop={false} pointerEvents="none" style={[styles.layer, { width }, animatedStyle]}>
      <View
        accessibilityElementsHidden
        className="rounded-xs border-hairline border-border-brand bg-bg-1"
        importantForAccessibility="no-hide-descendants"
      >
        <TaskCardMini
          columnTitle={columnTitle}
          disabled
          labels={labels}
          task={task}
          onOpen={NOOP}
          onOpenMenu={NOOP}
        />
      </View>
      {hint ? (
        <View accessibilityElementsHidden className="mt-2xs flex-row" importantForAccessibility="no-hide-descendants">
          <View className="flex-row items-center gap-3xs rounded-full border-hairline border-border-warning-subtle bg-surface-warning px-xs py-3xs">
            <Icon color="warning" name="timer" size={14} />
            <Text className="text-label-sm text-fg-1">{hint}</Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { left: 0, position: 'absolute', top: 0 },
});
