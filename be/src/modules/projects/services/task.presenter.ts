import type { ColumnKindValue } from "../entities/board.interface";
import type { ReviewStateValue, Task } from "../entities/task.interface";
import type { IProjectDirectory, UserSummary } from "../repositories/project-directory.interface";

export interface TaskCardDto {
  id: string;
  boardId: string;
  columnId: string;
  columnKind: ColumnKindValue;
  position: string;
  title: string;
  assignees: UserSummary[];
  labelIds: string[];
  dueDate: string | null;
  isOverdue: boolean;
  storyPoints: number | null;
  checklistDone: number;
  checklistTotal: number;
  attachmentCount: number;
  commentCount: number;
  reviewState: ReviewStateValue;
  /**
   * (p4-05) Tiến độ lượt chấm ĐANG MỞ ("Chờ duyệt 1/2") — chỉ có ở `GET /boards/:id/tasks` và `task:updated { changed: ["review"] }`
   * khi `reviewState = PENDING`; vắng ở các bản dựng khác (client giữ giá trị đã có khi gộp).
   */
  review?: { approvedCount: number; requiredReviews: number } | null;
  completedAt: string | null;
  /** p4-04 — chip phụ thuộc trên thẻ mini. */
  blockedByCount: number;
  blockingCount: number;
  version: number;
  updatedAt: string;
}

export interface TaskMoveResultDto {
  id: string;
  columnId: string;
  columnKind: ColumnKindValue;
  position: string;
  version: number;
  completedAt: string | null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function isTaskOverdue(task: Pick<Task, "dueDate" | "columnKind">, now: Date): boolean {
  return task.dueDate !== null && task.dueDate.getTime() < now.getTime() && task.columnKind !== "DONE";
}

export function toTaskCard(task: Task, users: Map<string, UserSummary>, now: Date): TaskCardDto {
  return {
    id: task.id,
    boardId: task.boardId,
    columnId: task.columnId,
    columnKind: task.columnKind,
    position: task.position,
    title: task.title,
    // Người làm đã rời hệ thống vẫn giữ chỗ (tên rỗng) thay vì biến mất khỏi danh sách.
    assignees: task.assigneeIds.map((id) => users.get(id) ?? { id, name: "", avatarUrl: null }),
    labelIds: task.labelIds,
    dueDate: iso(task.dueDate),
    isOverdue: isTaskOverdue(task, now),
    storyPoints: task.storyPoints,
    checklistDone: task.checklistDone,
    checklistTotal: task.checklistTotal,
    attachmentCount: task.attachmentCount,
    commentCount: task.commentCount,
    reviewState: task.reviewState,
    completedAt: iso(task.completedAt),
    blockedByCount: task.blockedByCount ?? 0,
    blockingCount: task.blockingCount ?? 0,
    version: task.version,
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toTaskMoveResult(task: Task): TaskMoveResultDto {
  return {
    id: task.id,
    columnId: task.columnId,
    columnKind: task.columnKind,
    position: task.position,
    version: task.version,
    completedAt: iso(task.completedAt),
  };
}

/** Dựng nhiều thẻ với MỘT lần tra tên người (không N+1). */
export async function presentTaskCards(tasks: Task[], directory: IProjectDirectory, now: Date): Promise<TaskCardDto[]> {
  const ids = [...new Set(tasks.flatMap((t) => t.assigneeIds))];
  const users = await directory.userSummaries(ids);
  return tasks.map((t) => toTaskCard(t, users, now));
}
