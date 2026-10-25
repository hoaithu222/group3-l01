import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';

import type { BoardColumn, TaskCardDto } from '../api/boards.types';
import { COLUMN_KIND_ART } from '../constants/kanban.constants';
import type { MoveTaskInput } from '../hooks/useMoveTask';
import type { MoveShortcut } from '../utils/move-neighbors';
import { planMove, type MoveIntent, type TasksByColumn } from '../utils/plan-move';
import { type MovePositionCell, MovePositionGrid } from './MovePositionGrid';

const SHORTCUTS: { label: string; shortcut: MoveShortcut }[] = [
  { label: 'Lên đầu cột', shortcut: 'top' },
  { label: 'Lên 1', shortcut: 'up' },
  { label: 'Xuống 1', shortcut: 'down' },
  { label: 'Xuống cuối cột', shortcut: 'bottom' },
];

export interface MoveTaskSheetProps {
  columns: readonly BoardColumn[];
  /** Mất mạng / không có quyền: sheet vẫn mở được để đọc, nhưng không chuyển được. */
  disabled: boolean;
  task: TaskCardDto | null;
  tasks: TasksByColumn;
  onClose: () => void;
  onMove: (input: MoveTaskInput) => void;
  /** "Giao cho tôi" (p3-03): chỉ hiện khi truyền — nơi gọi quyết định theo quyền sửa và việc mình đã là người làm. */
  onAssignToMe?: (task: TaskCardDto) => void;
  /** "Xoá thẻ" (p3-03): chỉ hiện khi truyền — nơi gọi quyết định theo quyền xoá. */
  onDelete?: (task: TaskCardDto) => void;
  /** "Nhân bản thẻ" (p3-03 P1): chỉ hiện khi truyền — nơi gọi quyết định theo quyền tạo thẻ (`workspace.task.create`). */
  onDuplicate?: (task: TaskCardDto) => void;
  /** Bỏ trống khi sheet mở TỪ chính màn chi tiết (nút "Mở chi tiết" sẽ vô nghĩa). */
  onOpenTask?: (task: TaskCardDto) => void;
}

/**
 * Menu thẻ + FALLBACK của kéo thả (`app.md` §3, §7): mở chi tiết, chọn cột đích,
 * rồi "Lên đầu/Xuống cuối/Lên 1/Xuống 1". LUÔN có, bất kể spike kéo thả ra sao —
 * cho trình đọc màn hình, người dùng một tay, và khi kéo giữa cột trên điện
 * thoại không đạt (README §10).
 *
 * Vị trí tính bằng `planMove` → `afterTaskId`/`beforeTaskId` — cùng hàm thuần mà
 * hành động trợ năng của thẻ dùng, và cùng kiểu dữ liệu với đường kéo thả.
 */
export function MoveTaskSheet({
  columns,
  disabled,
  task,
  tasks,
  onClose,
  onMove,
  onAssignToMe,
  onDelete,
  onDuplicate,
  onOpenTask,
}: MoveTaskSheetProps) {
  // Cột chọn ghi kèm id thẻ: đổi sang thẻ khác thì tự về "cột hiện tại" mà không cần effect reset.
  const [picked, setPicked] = useState<{ columnId: string; taskId: string } | null>(null);
  if (!task) return null;

  const targetId = picked?.taskId === task.id ? picked.columnId : task.columnId;
  const sameColumn = targetId === task.columnId;

  const run = (intent: MoveIntent) => {
    const plan = planMove(task, columns, tasks, intent);
    if (!plan) return;
    // Chuyển thẻ = hành động chính của tấm ⇒ rung nhẹ xác nhận (kéo thả có nhịp riêng ở `DragProvider`).
    hapticTap();
    onMove(plan);
    onClose();
  };

  // Cùng cột: 4 lối tắt (lưới 2×2 theo thứ tự đọc); cột khác: chỉ "Đầu cột" / "Cuối cột" (một hàng).
  const positions: MovePositionCell[] = sameColumn
    ? SHORTCUTS.map(({ label, shortcut }) => ({
        disabled: disabled || !planMove(task, columns, tasks, { kind: 'shortcut', shortcut }),
        key: shortcut,
        label,
        onPress: () => run({ kind: 'shortcut', shortcut }),
      }))
    : (['top', 'bottom'] as const).map((edge) => ({
        disabled,
        key: edge,
        label: edge === 'top' ? 'Đầu cột' : 'Cuối cột',
        onPress: () => run({ columnId: targetId, edge, kind: 'column' }),
      }));

  return (
    <BottomSheet scrollable title={task.title} visible onClose={onClose}>
      <View className="gap-md pb-md">
        {disabled ? (
          <Alert
            description="Cần kết nối mạng và quyền chuyển thẻ để đổi cột hoặc vị trí."
            tone="warning"
          />
        ) : null}

        {/* Hành động trên thẻ = hàng `ListItem` (cùng ngôn ngữ với `ActionMenu`), không phải hai nút `secondary` ngang hàng với nút vị trí bên dưới. */}
        {onOpenTask || onAssignToMe || onDuplicate ? (
          <View>
            {onOpenTask ? (
              <ListItem
                divider={Boolean(onAssignToMe || onDuplicate)}
                emphasis="title"
                label="Mở chi tiết thẻ"
                leading={<Icon color="fg-2" name="view" />}
                onPress={() => {
                  onClose();
                  onOpenTask(task);
                }}
              />
            ) : null}
            {onAssignToMe ? (
              <ListItem
                divider={Boolean(onDuplicate)}
                emphasis="title"
                label="Giao cho tôi"
                leading={<Icon color="fg-2" name="user-add" />}
                onPress={() => {
                  onClose();
                  onAssignToMe(task);
                }}
              />
            ) : null}
            {onDuplicate ? (
              <ListItem
                emphasis="title"
                label="Nhân bản thẻ"
                leading={<Icon color="fg-2" name="copy" />}
                onPress={() => {
                  onClose();
                  onDuplicate(task);
                }}
              />
            ) : null}
          </View>
        ) : null}

        {/* `Section tone="default"` thay chữ tự dựng: đúng một kiểu tiêu đề nhóm cho mọi tấm, kèm vai `header`. */}
        <Section title="Chuyển sang cột…" tone="default">
          <View
            accessibilityLabel="Cột đích"
            accessibilityRole="radiogroup"
            className="flex-row flex-wrap gap-xs"
          >
            {columns.map((column) => (
              <Chip
                key={column.id}
                disabled={disabled}
                label={column.id === task.columnId ? `${column.title} (hiện tại)` : column.title}
                // Cùng icon LOẠI cột với đầu cột Kanban — chọn cột đích bằng mắt nhanh hơn đọc tên.
                leading={
                  <Icon
                    color={disabled ? 'fg-2' : 'fg-brand'}
                    name={COLUMN_KIND_ART[column.kind].icon}
                    size="sm"
                  />
                }
                role="radio"
                selected={column.id === targetId}
                onPress={() => {
                  hapticSelection();
                  setPicked({ columnId: column.id, taskId: task.id });
                }}
              />
            ))}
          </View>
        </Section>

        <Section title="Vị trí trong cột" tone="default">
          <MovePositionGrid cells={positions} />
        </Section>

        {onDelete ? (
          <ListItem
            // `danger` tô ĐỎ cả nhãn (không chỉ icon) — `tone="error"` cũ chỉ tô cột giá trị nên chữ "Xoá thẻ" vẫn đen.
            emphasis="danger"
            label="Xoá thẻ"
            leading={<Icon color="error" name="delete" />}
            onPress={() => {
              onClose();
              onDelete(task);
            }}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}
