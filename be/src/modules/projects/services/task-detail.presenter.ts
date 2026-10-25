import { LIMITS } from "../../../core/constants/limits";
import type { ResolvedAccess } from "../../../core/permission";
import type { ChecklistItem, Task } from "../entities/task.interface";
import type { Label } from "../entities/label.interface";
import type { UserSummary } from "../repositories/project-directory.interface";
import { toLabelDto, type LabelDto } from "./board.presenter";
import { EMPTY_DEPENDENCIES, type TaskDependenciesDto } from "./dependency.presenter";
import type { TaskReviewsDto } from "./review/review-query.service";
import { toTaskCard, type TaskCardDto } from "./task.presenter";

export interface ChecklistItemDto {
  id: string;
  text: string;
  done: boolean;
  doneBy: string | null;
  doneAt: string | null;
  order: number;
}

/** Quyền của tôi trên thẻ — SERVER tính (client không tự suy từ vai trò, conventions §2). */
export interface TaskPermissionsDto {
  edit: boolean;
  delete: boolean;
  comment: boolean;
  attach: boolean;
  /** Chỉ `true` với thẻ đang xoá mềm, còn trong hạn khôi phục và tôi là người xoá hoặc OWNER/ADMIN. */
  restore: boolean;
}

export interface TaskDetailDto extends TaskCardDto {
  description: string | null;
  startDate: string | null;
  checklist: ChecklistItemDto[];
  createdBy: string;
  createdAt: string;
  labels: LabelDto[];
  /** Có giá trị khi mở thẻ đã xoá bằng `?includeDeleted=true` (người có quyền khôi phục). */
  deletedAt: string | null;
  /** (p4-04) Thẻ trước/thẻ sau — làm `initialData` cho `GET /tasks/:id/dependencies` ở app. Thẻ đã xoá: hai danh sách rỗng. */
  dependencies: TaskDependenciesDto;
  /** (p4-05) Chấm chéo của thẻ — làm `initialData` cho `GET /tasks/:id/reviews` ở app; vắng khi chưa nối module chấm chéo hoặc thẻ đã xoá. */
  reviews?: TaskReviewsDto;
  /** (p7-04) Tin nhắn nguồn nếu thẻ được tạo từ chat — chỉ THAM CHIẾU (app dựng liên kết mở tin; người không đọc được tin nhận 404 của `messages`). Vắng với thẻ tạo tay. */
  sourceMessageRef?: { scopeType: "CHANNEL" | "CONVERSATION"; scopeId: string; messageId: string };
  myPermissions: TaskPermissionsDto;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export const toChecklistItemDto = (i: ChecklistItem): ChecklistItemDto => ({
  id: i.id,
  text: i.text,
  done: i.done,
  doneBy: i.doneBy,
  doneAt: iso(i.doneAt),
  order: i.order,
});

/** Mục checklist theo `order` tăng dần (hoà → theo `id`) — mọi response dùng CÙNG một thứ tự. */
export const sortedChecklist = (items: ChecklistItem[]): ChecklistItem[] =>
  [...items].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Hết hạn khôi phục sau `trashRetentionDays` (30 ngày) kể từ lúc xoá. */
export function isRestorable(task: Pick<Task, "deletedAt">, now: Date): boolean {
  if (!task.deletedAt) return false;
  return now.getTime() - task.deletedAt.getTime() <= LIMITS.task.trashRetentionDays * 86_400_000;
}

export function computeTaskPermissions(task: Task, access: ResolvedAccess, userId: string, now: Date): TaskPermissionsDto {
  const deleted = task.deletedAt !== null;
  const canEdit = !deleted && access.actions.has("workspace.task.update");
  const canManageOthers = access.actions.has("workspace.task.delete");
  return {
    edit: canEdit,
    attach: canEdit,
    comment: !deleted && access.actions.has("workspace.task.comment"),
    delete: canEdit && (task.createdBy === userId || canManageOthers),
    restore:
      deleted && isRestorable(task, now) && access.actions.has("workspace.task.update") && (task.deletedBy === userId || canManageOthers),
  };
}

export function toTaskDetail(
  task: Task,
  users: Map<string, UserSummary>,
  labels: Label[],
  myPermissions: TaskPermissionsDto,
  now: Date,
  dependencies: TaskDependenciesDto = EMPTY_DEPENDENCIES,
  reviews?: TaskReviewsDto
): TaskDetailDto {
  const byId = new Map(labels.map((l) => [l.id, l]));
  return {
    ...toTaskCard(task, users, now),
    description: task.description,
    startDate: iso(task.startDate),
    checklist: sortedChecklist(task.checklist).map(toChecklistItemDto),
    createdBy: task.createdBy,
    createdAt: task.createdAt.toISOString(),
    // Theo thứ tự `labelIds` của thẻ; nhãn đã bị xoá (không còn ở bảng) bị bỏ qua.
    labels: task.labelIds.flatMap((id) => (byId.has(id) ? [toLabelDto(byId.get(id) as Label)] : [])),
    deletedAt: iso(task.deletedAt),
    dependencies,
    ...(reviews && { reviews }),
    ...(task.sourceMessageRef && {
      sourceMessageRef: { scopeType: task.sourceMessageRef.scopeType, scopeId: task.sourceMessageRef.scopeId, messageId: task.sourceMessageRef.messageId },
    }),
    myPermissions,
  };
}
