import { ValidationError } from "../../../core/exceptions";
import type { Board } from "../entities/board.interface";
import type { ILabelRepository } from "../repositories/label.repository.interface";
import type { IProjectDirectory } from "../repositories/project-directory.interface";

/**
 * Người làm MỚI phải là thành viên ACTIVE (không GUEST); nhãn MỚI phải thuộc bảng — sai → 400 kèm id sai.
 * Chỉ kiểm phần MỚI THÊM: người làm cũ đã rời nhóm vẫn được giữ/gỡ mà không bị chặn lưu các trường khác.
 */
export async function assertNewTaskRefs(
  deps: { directory: IProjectDirectory; labels: ILabelRepository },
  board: Board,
  newAssigneeIds: string[],
  newLabelIds: string[]
): Promise<void> {
  if (newAssigneeIds.length === 0 && newLabelIds.length === 0) return;
  const [members, labels] = await Promise.all([
    deps.directory.activeMemberIds(board.workspaceId, newAssigneeIds),
    deps.labels.findByBoardAndIds(board.id, newLabelIds),
  ]);
  const known = new Set(labels.map((l) => l.id));
  const invalidAssigneeIds = newAssigneeIds.filter((id) => !members.has(id));
  const invalidLabelIds = newLabelIds.filter((id) => !known.has(id));
  if (invalidAssigneeIds.length > 0 || invalidLabelIds.length > 0) {
    throw new ValidationError("Người làm hoặc nhãn không hợp lệ", {
      ...(invalidAssigneeIds.length > 0 && { invalidAssigneeIds }),
      ...(invalidLabelIds.length > 0 && { invalidLabelIds }),
    });
  }
}
