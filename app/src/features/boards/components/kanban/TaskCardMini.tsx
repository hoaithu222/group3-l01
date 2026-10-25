import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils/style/cn';

import type { BoardLabel, TaskCardDto } from '../../api/boards.types';
import { taskAccessibilityLabel } from '../../utils/task-format';
import { DependencyChip } from './DependencyChip';
import { ReviewChip } from './ReviewChip';
import { TaskCardFooter } from './TaskCardFooter';
import { TaskLabels } from './TaskLabels';

/** Tên hành động trợ năng — `MoveTaskSheet` cũng có mọi thao tác này (`app.md` §7). */
export type TaskA11yAction = 'moveDown' | 'moveUp' | 'nextColumn' | 'previousColumn';

const A11Y_ACTIONS: { label: string; name: TaskA11yAction }[] = [
  { label: 'Chuyển sang cột trước', name: 'previousColumn' },
  { label: 'Chuyển sang cột sau', name: 'nextColumn' },
  { label: 'Lên', name: 'moveUp' },
  { label: 'Xuống', name: 'moveDown' },
];

export interface TaskCardMiniProps {
  columnTitle: string;
  /** Thẻ tạm (`tmp_…`, chưa có id server) ⇒ chưa mở/chuyển được. */
  disabled?: boolean;
  /** Thẻ gốc đang được nâng lên — mờ đi, để chỗ trống đúng vị trí cũ. */
  lifted?: boolean;
  labels: ReadonlyMap<string, BoardLabel>;
  /** Mất mạng / không có quyền chuyển thẻ: vẫn MỞ được (đọc cache), nhưng khoá menu và hành động chuyển. */
  menuDisabled?: boolean;
  task: TaskCardDto;
  onA11yAction?: (task: TaskCardDto, action: TaskA11yAction) => void;
  onOpen: (task: TaskCardDto) => void;
  onOpenMenu: (task: TaskCardDto) => void;
}

/**
 * Thẻ việc thu nhỏ trong cột Kanban (`app.md` §2 `TaskCardMini`).
 *
 * ⚠️ Nút "…" là ANH EM của vùng nội dung chứ không lồng trong nó: `Pressable`
 * mặc định `accessible` và gộp cả cây con thành MỘT ô, nút lồng bên trong sẽ
 * không tới được TalkBack — người dùng khiếm thị không mở được menu chuyển cột
 * (cùng bẫy đã ghi ở `Chip.tsx`).
 *
 * `memo`: mỗi cột có tới 100–200 thẻ; chỉ thẻ đổi mới cần vẽ lại.
 */
function TaskCardMiniBase({
  columnTitle,
  disabled = false,
  labels,
  lifted = false,
  menuDisabled = false,
  task,
  onA11yAction,
  onOpen,
  onOpenMenu,
}: TaskCardMiniProps) {
  return (
    <View
      className={cn(
        'rounded-xs border-hairline border-border-1 bg-bg-1 p-sm',
        (lifted || disabled) && 'opacity-60',
      )}
    >
      <View className="flex-row items-start gap-xs">
        <Pressable
          accessibilityActions={onA11yAction && !disabled && !menuDisabled ? A11Y_ACTIONS : undefined}
          accessibilityHint="Mở chi tiết thẻ"
          accessibilityLabel={taskAccessibilityLabel(task, columnTitle)}
          accessibilityRole="button"
          // `active:` = mờ nhẹ lúc ngón tay đặt xuống (NativeWind nối onPressIn/Out) — trước đây chạm thẻ không có phản hồi nào.
          className="min-h-[44px] flex-1 gap-xs active:opacity-70"
          disabled={disabled}
          onAccessibilityAction={(event) =>
            onA11yAction?.(task, event.nativeEvent.actionName as TaskA11yAction)
          }
          onPress={() => onOpen(task)}
        >
          <Text
            className="text-label-md font-medium text-fg-1"
            maxFontSizeMultiplier={1.3}
            numberOfLines={3}
          >
            {task.title}
          </Text>
          <TaskLabels labelIds={task.labelIds} labels={labels} />
          <DependencyChip blockedByCount={task.blockedByCount} blockingCount={task.blockingCount} />
          <ReviewChip task={task} />
          <TaskCardFooter task={task} />
        </Pressable>

        <Button
          accessibilityLabel={`Tuỳ chọn thẻ ${task.title}`}
          disabled={disabled || menuDisabled}
          iconLeft="more"
          iconOnly
          size="xs"
          variant="tertiary"
          onPress={() => onOpenMenu(task)}
        />
      </View>
    </View>
  );
}

export const TaskCardMini = memo(TaskCardMiniBase);
