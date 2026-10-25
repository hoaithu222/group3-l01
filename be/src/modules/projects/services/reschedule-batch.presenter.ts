import type { RescheduleBatch, RescheduleBatchStatusValue } from "../entities/reschedule.interface";

/** `GET /reschedule-batches/:id` (be.md §4). `conflicts` ≤ 50 thẻ (đã sửa/xoá/hoàn thành giữa lô). */
export interface RescheduleBatchDto {
  id: string;
  status: RescheduleBatchStatusValue;
  affectedCount: number;
  appliedCount: number;
  conflictCount: number;
  conflicts: { taskId: string; title: string }[];
  createdAt: string;
  finishedAt: string | null;
}

/** `titles`: tiêu đề HIỆN TẠI của các thẻ xung đột (thẻ đã xoá không còn → tiêu đề rỗng, id vẫn giữ). */
export function toBatchDto(batch: RescheduleBatch, titles: Map<string, string>): RescheduleBatchDto {
  return {
    id: batch.id,
    status: batch.status,
    affectedCount: batch.affectedCount,
    appliedCount: batch.appliedCount,
    conflictCount: batch.conflictCount,
    conflicts: batch.items
      .filter((i) => i.result === "CONFLICT")
      .slice(0, 50)
      .map((i) => ({ taskId: i.taskId, title: titles.get(i.taskId) ?? "" })),
    createdAt: batch.createdAt.toISOString(),
    finishedAt: batch.finishedAt ? batch.finishedAt.toISOString() : null,
  };
}
