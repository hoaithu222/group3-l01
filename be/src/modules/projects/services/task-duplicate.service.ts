import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { DuplicateTaskDto } from "../dtos";
import type { Task, TaskSeed } from "../entities/task.interface";
import type { CreateTaskResult, TaskService } from "./task.service";
import type { TaskDetailDeps } from "./task-detail.deps";

const COPY_SUFFIX = " (bản sao)";

/** "<tiêu đề> (bản sao)" — cắt tiêu đề gốc để tổng không vượt trần tiêu đề. */
export function copyTitle(title: string): string {
  return `${[...title].slice(0, LIMITS.task.titleMax - COPY_SUFFIX.length).join("")}${COPY_SUFFIX}`;
}

/**
 * Sao chép thẻ (p3-03 P1, `POST /tasks/:id/duplicate`). Dựng đầu vào rồi đi ĐÚNG đường `TaskService.create` (quyền `workspace.task.create`, trần số thẻ
 * `TASK_010`, vị trí do server tính, activity `CREATED`, outbox, chính sách vào DONE của chấm chéo…) — không có đường tạo thứ hai.
 *
 * Sao chép: nhãn (còn tồn tại trên bảng), mô tả, ngày bắt đầu/hạn, điểm, checklist (mục mới, `done = false`); người làm chỉ khi `keepAssignees` và còn là
 * thành viên hợp lệ. KHÔNG sao chép: tệp đính kèm (một asset chỉ gắn một nơi), bình luận, nhật ký, phụ thuộc, trạng thái duyệt/hoàn thành.
 */
export class TaskDuplicateService {
  constructor(
    private readonly d: Pick<TaskDetailDeps, "access" | "labels" | "directory">,
    private readonly tasks: Pick<TaskService, "create">
  ) {}

  async duplicate(user: AuthUser, taskId: string, dto: DuplicateTaskDto): Promise<CreateTaskResult> {
    const { task: src, board } = await this.d.access.task(user, taskId, "workspace.task.create");

    const from = board.columns.find((c) => c.id === src.columnId);
    const columnId = dto.columnId ?? (from && (from.kind === "TODO" || from.kind === "IN_PROGRESS") ? from.id : undefined);
    const [labels, members] = await Promise.all([
      this.d.labels.findByBoardAndIds(board.id, src.labelIds),
      dto.keepAssignees ? this.d.directory.activeMemberIds(src.workspaceId, src.assigneeIds) : Promise.resolve(new Set<string>()),
    ]);

    return this.tasks.create(
      user,
      board.id,
      {
        title: dto.title ?? copyTitle(src.title),
        columnId,
        // Ngay SAU thẻ gốc khi cùng cột; khác cột ⇒ cuối cột đích.
        afterTaskId: columnId === src.columnId ? src.id : undefined,
        assigneeIds: src.assigneeIds.filter((id) => members.has(id)),
        labelIds: labels.map((l) => l.id),
        dueDate: src.dueDate ?? undefined,
        clientTaskId: dto.clientTaskId,
        clientMutationId: dto.clientMutationId,
      },
      seedOf(src, dto.keepChecklist)
    );
  }
}

function seedOf(src: Task, keepChecklist: boolean): TaskSeed {
  return {
    description: src.description,
    startDate: src.startDate,
    storyPoints: src.storyPoints,
    checklist: keepChecklist ? src.checklist.map((i) => ({ id: newObjectId(), text: i.text, done: false, doneBy: null, doneAt: null, order: i.order })) : [],
  };
}
