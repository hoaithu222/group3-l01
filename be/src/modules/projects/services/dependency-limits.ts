import { LIMITS } from "../../../core/constants/limits";
import { runtimeConfig } from "../../../core/config/runtime-config";

/** Giới hạn hiệu lực của phụ thuộc/dời lịch/Gantt (p4-04 be.md §9): mặc định `LIMITS` ⊕ override `SystemConfig` (đã clamp về trần cứng). */
export interface DependencyLimits {
  dependenciesMax: number;
  dependencyGraphVisitMax: number;
  rescheduleSyncMax: number;
  rescheduleBulkMax: number;
  rescheduleEmitEachMax: number;
  ganttRangeMaxDays: number;
  ganttTasksMax: number;
}

export interface IDependencyLimits {
  load(): Promise<DependencyLimits>;
}

const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** Giá trị mã — dùng khi không cần runtime (unit test, mặc định của service). */
export const STATIC_DEPENDENCY_LIMITS: IDependencyLimits = {
  load: () =>
    Promise.resolve({
      dependenciesMax: LIMITS.task.dependenciesMax,
      dependencyGraphVisitMax: LIMITS.task.dependencyGraphVisitMax,
      rescheduleSyncMax: LIMITS.task.rescheduleSyncMax,
      rescheduleBulkMax: LIMITS.task.rescheduleBulkMax,
      rescheduleEmitEachMax: LIMITS.task.rescheduleEmitEachMax,
      ganttRangeMaxDays: LIMITS.gantt.rangeMaxDays,
      ganttTasksMax: LIMITS.gantt.tasksMax,
    }),
};

/** Đọc qua `runtimeConfig` (`limits.task`, `limits.gantt`): bộ nhớ → Redis → Mongo, fail-open về mặc định. */
export class RuntimeDependencyLimits implements IDependencyLimits {
  async load(): Promise<DependencyLimits> {
    const [task, gantt] = await Promise.all([runtimeConfig.getEffective("limits.task"), runtimeConfig.getEffective("limits.gantt")]);
    return {
      dependenciesMax: num(task["dependenciesMax"], LIMITS.task.dependenciesMax),
      dependencyGraphVisitMax: num(task["dependencyGraphVisitMax"], LIMITS.task.dependencyGraphVisitMax),
      rescheduleSyncMax: num(task["rescheduleSyncMax"], LIMITS.task.rescheduleSyncMax),
      rescheduleBulkMax: num(task["rescheduleBulkMax"], LIMITS.task.rescheduleBulkMax),
      rescheduleEmitEachMax: num(task["rescheduleEmitEachMax"], LIMITS.task.rescheduleEmitEachMax),
      ganttRangeMaxDays: num(gantt["rangeMaxDays"], LIMITS.gantt.rangeMaxDays),
      ganttTasksMax: num(gantt["tasksMax"], LIMITS.gantt.tasksMax),
    };
  }
}
