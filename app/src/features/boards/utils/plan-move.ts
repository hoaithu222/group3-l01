import type { BoardColumn, TaskCardDto } from '../api/boards.types';
import type { MoveTaskInput } from '../hooks/useMoveTask';
import { neighborsAt, shortcutSlot, type MoveShortcut } from './move-neighbors';

/**
 * Ý định di chuyển từ MỌI đường KHÔNG-kéo-thả: `MoveTaskSheet` và hành động trợ
 * năng của thẻ (`accessibilityActions`). Gom về một chỗ để hai nơi ra cùng kết
 * quả (`app.md` §7: "không chức năng nào CHỈ có qua kéo thả").
 */
export type MoveIntent =
  | { kind: 'adjacentColumn'; direction: -1 | 1 }
  | { kind: 'column'; columnId: string; edge: 'bottom' | 'top' }
  | { kind: 'shortcut'; shortcut: MoveShortcut };

export type TasksByColumn = Readonly<Record<string, readonly TaskCardDto[]>>;

/** `null` khi ý định vô nghĩa (đã ở đầu/cuối, không có cột kế bên, cột không tồn tại). */
export function planMove(
  task: TaskCardDto,
  columns: readonly BoardColumn[],
  tasks: TasksByColumn,
  intent: MoveIntent,
): MoveTaskInput | null {
  const idsOf = (columnId: string) => (tasks[columnId] ?? []).map((item) => item.id);
  const build = (columnId: string, slot: number): MoveTaskInput | null => {
    const column = columns.find((item) => item.id === columnId);
    if (!column) return null;
    return { columnId, columnKind: column.kind, task, ...neighborsAt(idsOf(columnId), task.id, slot) };
  };

  switch (intent.kind) {
    case 'shortcut': {
      const slot = shortcutSlot(idsOf(task.columnId), task.id, intent.shortcut);
      return slot === null ? null : build(task.columnId, slot);
    }
    case 'column': {
      const slot = intent.edge === 'top' ? 0 : idsOf(intent.columnId).length;
      return build(intent.columnId, slot);
    }
    case 'adjacentColumn': {
      const index = columns.findIndex((column) => column.id === task.columnId);
      const next = columns[index + intent.direction];
      return index < 0 || !next ? null : build(next.id, idsOf(next.id).length);
    }
  }
}
