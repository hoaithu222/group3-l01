import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { Board, BoardColumn } from "../entities/board.interface";
import type { Task, TaskSeed } from "../entities/task.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { TaskService } from "./task.service";

export interface BoardTaskCopyResult {
  /** Số thẻ đã tạo trên bảng mới. */
  copied: number;
  /** `true` khi bảng gốc còn thẻ chưa sao chép vì chạm trần `LIMITS.board.duplicateTasksMax`. */
  truncated: boolean;
}

export interface BoardTaskCopierDeps {
  tasks: Pick<ITaskRepository, "listColumn">;
  /** Thẻ mới đi ĐÚNG đường `TaskService.create` (quyền `workspace.task.create`, trần số thẻ, vị trí do server, activity, outbox) — không có đường tạo thẻ thứ hai. */
  creator: Pick<TaskService, "create">;
}

const byOrder = (a: BoardColumn, b: BoardColumn): number => a.order - b.order;

/**
 * Sao chép thẻ khi sao chép bảng (`includeTasks`, p3-02 P1). Cột nguồn ↔ cột đích ghép theo THỨ TỰ (bản sao dựng cột theo đúng thứ tự cột gốc). Thẻ ở cột DONE bị bỏ
 * (bản sao là bảng làm việc mới; và tạo thẳng vào DONE còn dính chính sách chấm chéo). Thẻ mới KHÔNG mang người làm/bình luận/tệp/nhật ký/phụ thuộc/trạng thái duyệt; nhãn ánh
 * xạ theo bảng `labelIdMap` (nhãn gốc chưa có bản sao — vd `includeLabels=false` — thì bỏ). Tuần tự từng cột theo thứ tự vị trí nên thứ tự thẻ được giữ.
 */
export class BoardTaskCopier {
  constructor(private readonly d: BoardTaskCopierDeps) {}

  async copy(
    user: AuthUser,
    source: Pick<Board, "id" | "columns">,
    target: { id: string; columns: BoardColumn[] },
    labelIdMap: ReadonlyMap<string, string>
  ): Promise<BoardTaskCopyResult> {
    const cap = LIMITS.board.duplicateTasksMax;
    const from = [...source.columns].sort(byOrder);
    const to = [...target.columns].sort(byOrder);
    const now = new Date();
    let copied = 0;

    for (let i = 0; i < from.length; i += 1) {
      const column = from[i];
      const destination = to[i];
      if (!column || !destination || column.kind === "DONE") continue;
      // Lấy dư 1 để biết còn thẻ ngoài trần hay không.
      const rows = await this.d.tasks.listColumn(source.id, column.id, {}, cap - copied + 1, now);
      for (const task of rows) {
        if (copied >= cap) return { copied, truncated: true };
        await this.d.creator.create(
          user,
          target.id,
          {
            title: task.title,
            columnId: destination.id,
            assigneeIds: [],
            labelIds: task.labelIds.flatMap((id) => labelIdMap.get(id) ?? []),
            dueDate: task.dueDate ?? undefined,
          },
          seedOf(task)
        );
        copied += 1;
      }
    }
    return { copied, truncated: false };
  }
}

/** Mô tả, ngày bắt đầu, điểm, checklist (mục MỚI, chưa tích) — cùng quy tắc `TaskDuplicateService` khi `keepChecklist`. */
function seedOf(task: Task): TaskSeed {
  return {
    description: task.description,
    startDate: task.startDate,
    storyPoints: task.storyPoints,
    checklist: task.checklist.map((item) => ({ id: newObjectId(), text: item.text, done: false, doneBy: null, doneAt: null, order: item.order })),
  };
}
