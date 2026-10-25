import { TASK_EVENTS } from "../events/project-events";
import { registerTaskEventSink } from "../events/task-event-sinks";
import { getProjectsContainer } from "../projects.container";

/** Sự kiện làm đổi trạng thái "chưa DONE, chưa xoá" của thẻ ⇒ bộ đếm phụ thuộc của nó và hàng xóm có thể đổi. */
const WATCHED = new Set<string>([TASK_EVENTS.COMPLETED, TASK_EVENTS.REOPENED, TASK_EVENTS.DELETED, TASK_EVENTS.RESTORED]);

/**
 * (p4-04 be.md §5.8) Sink của job `task.events` — đếm lại `blockedByCount`/`blockingCount` từ cạnh (không ±1) nên
 * retry/chạy lặp vô hại. Nạp ở worker qua `register-jobs.ts`.
 */
registerTaskEventSink("p4-04.dependency-counts", async (payload) => {
  if (!WATCHED.has(payload.event)) return;
  await getProjectsContainer().dependencyService.recountAround(payload.taskId);
});
