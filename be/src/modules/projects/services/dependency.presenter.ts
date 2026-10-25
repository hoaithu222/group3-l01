import type { ColumnKindValue } from "../entities/board.interface";
import type { IProjectDirectory, UserSummary } from "../repositories/project-directory.interface";
import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import { presentTaskCards } from "./task.presenter";

export interface DependencyTaskDto {
  id: string;
  title: string;
  columnKind: ColumnKindValue;
  startDate: string | null;
  dueDate: string | null;
  assignees: UserSummary[];
}

/** Thẻ trước/thẻ sau của một thẻ — dùng cho `GET /tasks/:id/dependencies` và `TaskDetailDto.dependencies`. */
export interface TaskDependenciesDto {
  predecessors: DependencyTaskDto[];
  successors: DependencyTaskDto[];
}

export const EMPTY_DEPENDENCIES: TaskDependenciesDto = { predecessors: [], successors: [] };

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * Cạnh của `taskId` → danh sách thẻ hai đầu (chỉ thẻ CHƯA xoá và CÙNG bảng; cạnh mồ côi bị bỏ qua), mới → cũ theo lúc tạo cạnh.
 * KHÔNG kiểm quyền — caller đã kiểm quyền đọc thẻ.
 */
export async function presentTaskDependencies(
  taskId: string,
  boardId: string,
  d: { dependencies: ITaskDependencyRepository; directory: IProjectDirectory },
  now: Date
): Promise<TaskDependenciesDto> {
  const { predecessors, successors } = await d.dependencies.listForTask(taskId);
  const ids = [...new Set([...predecessors.map((e) => e.predecessorId), ...successors.map((e) => e.successorId)])];
  if (ids.length === 0) return { predecessors: [], successors: [] };
  const tasks = (await d.dependencies.liveTasks(ids)).filter((t) => t.boardId === boardId);
  const cards = await presentTaskCards(tasks, d.directory, now);
  const byId = new Map<string, DependencyTaskDto>();
  tasks.forEach((t, i) => {
    byId.set(t.id, {
      id: t.id,
      title: t.title,
      columnKind: t.columnKind,
      startDate: iso(t.startDate),
      dueDate: iso(t.dueDate),
      assignees: cards[i]?.assignees ?? [],
    });
  });
  const pick = (id: string): DependencyTaskDto[] => {
    const dto = byId.get(id);
    return dto ? [dto] : [];
  };
  return {
    predecessors: predecessors.flatMap((e) => pick(e.predecessorId)),
    successors: successors.flatMap((e) => pick(e.successorId)),
  };
}
