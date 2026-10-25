import type { BoardColumn, BoardLabel } from '../../api/boards.types';
import type { TaskDetailDto } from '../../api/task-detail.types';
import type { useTaskDetailActions } from '../../hooks/useTaskDetailActions';
import type { TaskAccess } from '../../utils/task-permissions';
import { AssigneePickerSheet } from './AssigneePickerSheet';
import { DateRangeSheet } from './DateRangeSheet';
import { DeleteTaskDialog } from './DeleteTaskDialog';
import { DuplicateTaskSheet } from './DuplicateTaskSheet';
import { LabelPickerSheet } from './LabelPickerSheet';
import { RescheduleWarningSheet } from './RescheduleWarningSheet';
import { StoryPointsSheet } from './StoryPointsSheet';
import { TaskMenuSheet } from './TaskMenuSheet';
import { TaskMoveSheetHost } from './TaskMoveSheetHost';

export interface TaskDetailSheetsProps {
  access: TaskAccess;
  actions: ReturnType<typeof useTaskDetailActions>;
  boardId: string;
  canCreateLabel: boolean;
  /** Quyền tạo thẻ của bảng (`TASK_CREATE`) VÀ đang online, thẻ chưa xoá — quyết định "Nhân bản thẻ" ở menu "…". */
  canDuplicate: boolean;
  /** Quyền chuyển cột của BẢNG (`TASK_UPDATE_STATUS`) VÀ đang online — khác quyền sửa trường của thẻ. */
  canMove: boolean;
  columns: readonly BoardColumn[];
  currentUserId: string;
  detail: TaskDetailDto;
  labelList: readonly BoardLabel[];
}

/**
 * Mọi tấm/hộp thoại của màn chi tiết, mở theo MỘT biến `sheet` (chỉ một tấm mở mỗi lúc — trừ `LabelSheet`
 * chồng lên tấm nhãn). Mỗi tấm lưu qua `actions.commit` và hiện lỗi lưu ngay trong tấm.
 */
export function TaskDetailSheets({
  access,
  actions,
  boardId,
  canCreateLabel,
  canDuplicate,
  canMove,
  columns,
  currentUserId,
  detail,
  labelList,
}: TaskDetailSheetsProps) {
  const { close, commit, saving, sheet, sheetError } = actions;
  const alreadyAssigned = detail.assignees.some((person) => person.id === currentUserId);

  return (
    <>
      <AssigneePickerSheet
        boardId={boardId}
        current={detail.assignees}
        error={sheetError}
        saving={saving}
        visible={sheet === 'assignees'}
        onClose={close}
        onConfirm={(assignees) =>
          void commit({
            optimistic: { assignees },
            patch: { assigneeIds: assignees.map((person) => person.id) },
          })
        }
      />
      <LabelPickerSheet
        boardId={boardId}
        canCreate={canCreateLabel}
        error={sheetError}
        labels={labelList}
        saving={saving}
        selectedIds={detail.labelIds}
        visible={sheet === 'labels'}
        onClose={close}
        onConfirm={(labelIds) => void commit({ optimistic: { labelIds }, patch: { labelIds } })}
      />
      <DateRangeSheet
        due={detail.dueDate}
        error={sheetError}
        saving={saving}
        start={detail.startDate}
        visible={sheet === 'dates'}
        onClose={close}
        onConfirm={(change) => void commit({ optimistic: change, patch: change })}
      />
      <StoryPointsSheet
        error={sheetError}
        saving={saving}
        value={detail.storyPoints}
        visible={sheet === 'points'}
        onClose={close}
        onConfirm={(storyPoints) =>
          void commit({ optimistic: { storyPoints }, patch: { storyPoints } })
        }
      />
      <RescheduleWarningSheet boardId={boardId} controller={actions.reschedule} />
      <TaskMenuSheet
        alreadyAssigned={alreadyAssigned}
        assigning={actions.assigning}
        canDelete={access.canDelete}
        canDuplicate={canDuplicate}
        canEdit={access.canEdit}
        visible={sheet === 'menu'}
        onAssignToMe={actions.assignToMe}
        onClose={close}
        onCopyLink={actions.copyLink}
        onDelete={() => actions.open('delete')}
        onDuplicate={() => actions.open('duplicate')}
      />
      <TaskMoveSheetHost
        boardId={boardId}
        columns={columns}
        disabled={!canMove}
        task={detail}
        visible={sheet === 'move'}
        onClose={close}
      />
      {sheet === 'duplicate' ? (
        <DuplicateTaskSheet boardId={boardId} columns={columns} task={detail} onClose={close} />
      ) : null}
      <DeleteTaskDialog
        pending={actions.deleting}
        task={sheet === 'delete' ? { id: detail.id, title: detail.title } : null}
        onClose={close}
        onConfirm={actions.confirmDelete}
      />
    </>
  );
}
