import type { Task } from "../entities/task.interface";
import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import type { DependencyLimits } from "./dependency-limits";
import { loadRescheduleGraph, tooLargeError } from "./reschedule-graph";
import { planReschedule, RescheduleTooLargeError, type PlanSkipped, type ReschedulePlan } from "./reschedule-planner";

/** Tối đa số mục `affected` trả trong preview (be.md §5.3). */
export const PREVIEW_AFFECTED_MAX = 200;

export interface ReschedulePreviewResultDto {
  source: { taskId: string; version: number; oldDueDate: string | null; newDueDate: string };
  mode: "SYNC" | "BULK";
  affectedCount: number;
  affected: {
    taskId: string;
    title: string;
    assigneeIds: string[];
    oldStartDate: string | null;
    oldDueDate: string | null;
    newStartDate: string | null;
    newDueDate: string | null;
    shiftDays: number;
  }[];
  truncated: boolean;
  skipped: PlanSkipped[];
  timezone: string;
  previewToken: string;
}

export interface RescheduleInput {
  dueDate: Date;
  startDate?: Date | null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Tải đồ thị + lập kế hoạch (thuần) cho thẻ nguồn; vượt trần → `TASK_021`. CHỈ ĐỌC. */
export async function buildReschedulePlan(
  dependencies: ITaskDependencyRepository,
  limits: DependencyLimits,
  source: Task,
  input: RescheduleInput,
  tz: string
): Promise<ReschedulePlan> {
  const { tasks, edges } = await loadRescheduleGraph(dependencies, source, limits.dependencyGraphVisitMax);
  try {
    return planReschedule(
      { id: source.id, version: source.version, newStartDate: input.startDate ?? null, newDueDate: input.dueDate },
      tasks,
      edges,
      tz,
      { syncMax: limits.rescheduleSyncMax, bulkMax: limits.rescheduleBulkMax }
    );
  } catch (err) {
    if (err instanceof RescheduleTooLargeError) throw tooLargeError();
    throw err;
  }
}

export function toPreviewDto(source: Task, input: RescheduleInput, plan: ReschedulePlan, tz: string): ReschedulePreviewResultDto {
  return {
    source: { taskId: source.id, version: source.version, oldDueDate: iso(source.dueDate), newDueDate: input.dueDate.toISOString() },
    mode: plan.mode,
    affectedCount: plan.affected.length,
    affected: plan.affected.slice(0, PREVIEW_AFFECTED_MAX).map((a) => ({
      taskId: a.taskId,
      title: a.title,
      assigneeIds: a.assigneeIds,
      oldStartDate: iso(a.oldStartDate),
      oldDueDate: iso(a.oldDueDate),
      newStartDate: iso(a.newStartDate),
      newDueDate: iso(a.newDueDate),
      shiftDays: a.shiftDays,
    })),
    truncated: plan.affected.length > PREVIEW_AFFECTED_MAX,
    skipped: plan.skipped,
    timezone: tz,
    previewToken: plan.previewToken,
  };
}
