import type { useKanbanBoard } from '../../hooks/useKanbanBoard';
import { MoveTaskSheet } from '../MoveTaskSheet';
import { DeleteTaskDialog } from '../task/DeleteTaskDialog';
import { DuplicateTaskSheet } from '../task/DuplicateTaskSheet';

export interface KanbanTaskModalsProps {
  boardId: string;
  kanban: ReturnType<typeof useKanbanBoard>;
}

/**
 * Menu thẻ + hộp thoại/tấm phát sinh từ nó của màn Kanban: `MoveTaskSheet` (chuyển cột/vị trí, Giao cho tôi, Nhân bản, Xoá), xác nhận xoá,
 * và tấm nhân bản thẻ (p3-03 P1). Tách khỏi `KanbanScreen` để màn không vượt trần 200 dòng — mọi quyền/hành động vẫn do `useKanbanBoard`
 * quyết định (mỗi hành động chỉ hiện khi nơi gọi truyền callback: "Nhân bản" theo quyền tạo thẻ, "Xoá" theo quyền xoá thẻ của người khác).
 */
export function KanbanTaskModals({ boardId, kanban }: KanbanTaskModalsProps) {
  return (
    <>
      <MoveTaskSheet
        columns={kanban.columns}
        disabled={!kanban.canMove}
        task={kanban.menuTask}
        tasks={kanban.tasksByColumn}
        onAssignToMe={
          kanban.canAssign && !kanban.menuTask?.assignees.some((person) => person.id === kanban.meId)
            ? kanban.onAssignToMe
            : undefined
        }
        onClose={() => kanban.setMenuTask(null)}
        onDelete={kanban.canDelete ? kanban.setDeleteTarget : undefined}
        onDuplicate={kanban.canCreate ? kanban.setDuplicateTarget : undefined}
        onMove={kanban.onMove}
        onOpenTask={kanban.onOpenTask}
      />
      <DeleteTaskDialog
        pending={kanban.deletePending}
        task={kanban.deleteTarget}
        onClose={() => kanban.setDeleteTarget(null)}
        onConfirm={kanban.onConfirmDelete}
      />
      {kanban.duplicateTarget ? (
        <DuplicateTaskSheet
          boardId={boardId}
          columns={kanban.columns}
          task={kanban.duplicateTarget}
          onClose={() => kanban.setDuplicateTarget(null)}
        />
      ) : null}
    </>
  );
}
