import type { TaskActivityType } from "../../../core/constants/project";
import { graphemeLength, normalizeSearch } from "../../../core/utils/normalize";
import type { PatchTaskDto } from "../dtos";
import type { Task, TaskPatchSet } from "../entities/task.interface";

export interface PlannedActivity {
  type: TaskActivityType;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** Tên trường trong `task:updated.changed` — app dựa vào đây để biết có phải tải lại chi tiết không. */
export type TaskChangedField = "title" | "description" | "assignees" | "labels" | "startDate" | "dueDate" | "storyPoints";

export interface TaskDiff {
  /** Tập ghi CAS — CHỈ chứa trường THẬT SỰ đổi. Rỗng ⇒ không có gì để ghi (không tăng `version`). */
  set: TaskPatchSet;
  activities: PlannedActivity[];
  changed: TaskChangedField[];
  addedAssigneeIds: string[];
  removedAssigneeIds: string[];
  dueChanged: boolean;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const sameDate = (a: Date | null, b: Date | null): boolean => (a === null || b === null ? a === b : a.getTime() === b.getTime());
const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** Mô tả rỗng/toàn khoảng trắng ≡ chưa có mô tả (`null`); còn lại giữ NGUYÊN (markdown có thể thụt lề có nghĩa). */
export const normalizeDescription = (value: string | null): string | null => (value === null || value.trim() === "" ? null : value);

/**
 * So `before` với `patch` (đã chuẩn hoá/kiểm hợp lệ) → tập ghi + danh sách activity + trường đổi. HÀM THUẦN.
 * Mỗi trường đổi → một activity; người làm thêm/bớt → MỖI người một activity; mô tả KHÔNG lưu toàn văn (chỉ độ dài).
 */
export function diffTask(before: Task, patch: PatchTaskDto): TaskDiff {
  const set: TaskPatchSet = {};
  const activities: PlannedActivity[] = [];
  const changed: TaskChangedField[] = [];
  let addedAssigneeIds: string[] = [];
  let removedAssigneeIds: string[] = [];
  let dueChanged = false;

  if (patch.title !== undefined && patch.title !== before.title) {
    set.title = patch.title;
    set.normalizedTitle = normalizeSearch(patch.title);
    activities.push({ type: "RENAMED", before: { title: before.title }, after: { title: patch.title } });
    changed.push("title");
  }

  if (patch.description !== undefined) {
    const next = normalizeDescription(patch.description);
    if (next !== before.description) {
      set.description = next;
      activities.push({
        type: "DESCRIPTION",
        before: { length: before.description ? graphemeLength(before.description) : 0 },
        after: { length: next ? graphemeLength(next) : 0 },
      });
      changed.push("description");
    }
  }

  if (patch.assigneeIds !== undefined && !sameSet(patch.assigneeIds, before.assigneeIds)) {
    addedAssigneeIds = patch.assigneeIds.filter((id) => !before.assigneeIds.includes(id));
    removedAssigneeIds = before.assigneeIds.filter((id) => !patch.assigneeIds?.includes(id));
    set.assigneeIds = patch.assigneeIds;
    for (const userId of addedAssigneeIds) activities.push({ type: "ASSIGNED", before: null, after: { userId } });
    for (const userId of removedAssigneeIds) activities.push({ type: "UNASSIGNED", before: { userId }, after: null });
    changed.push("assignees");
  }

  if (patch.labelIds !== undefined && !sameSet(patch.labelIds, before.labelIds)) {
    set.labelIds = patch.labelIds;
    activities.push({ type: "LABELS", before: { labelIds: before.labelIds }, after: { labelIds: patch.labelIds } });
    changed.push("labels");
  }

  if (patch.startDate !== undefined && !sameDate(patch.startDate, before.startDate)) {
    set.startDate = patch.startDate;
    activities.push({ type: "START_CHANGED", before: { startDate: iso(before.startDate) }, after: { startDate: iso(patch.startDate) } });
    changed.push("startDate");
  }

  if (patch.dueDate !== undefined && !sameDate(patch.dueDate, before.dueDate)) {
    set.dueDate = patch.dueDate;
    set.dueVersion = before.dueVersion + 1;
    dueChanged = true;
    activities.push({ type: "DUE_CHANGED", before: { dueDate: iso(before.dueDate) }, after: { dueDate: iso(patch.dueDate) } });
    changed.push("dueDate");
  }

  if (patch.storyPoints !== undefined && patch.storyPoints !== before.storyPoints) {
    set.storyPoints = patch.storyPoints;
    activities.push({ type: "POINTS", before: { storyPoints: before.storyPoints }, after: { storyPoints: patch.storyPoints } });
    changed.push("storyPoints");
  }

  return { set, activities, changed, addedAssigneeIds, removedAssigneeIds, dueChanged };
}
