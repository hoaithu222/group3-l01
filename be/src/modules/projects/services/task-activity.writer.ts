import type { TaskActivity, TaskActivityInput } from "../entities/task.interface";
import type { ITaskActivityRepository } from "../repositories/task-activity.repository.interface";
import type { TxContext } from "../repositories/unit-of-work";
import { KeyedMutex } from "./keyed-mutex";

/** Cửa sổ gộp activity checklist cùng người (p3-03 README §2). */
export const ACTIVITY_GROUP_WINDOW_MS = 60_000;

export type GroupMerge = (previous: TaskActivity) => { type: string; after: Record<string, unknown> | null };

/**
 * Ghi `TaskActivity` (dùng chung p3-03/p4-06). `record` chạy trong CÙNG transaction với thay đổi thẻ (PATCH, xoá,
 * khôi phục…); `recordGrouped` dành cho thao tác nguyên tử NGOÀI transaction (checklist): nếu bản ghi MỚI NHẤT của thẻ
 * cùng `groupKey` và còn trong cửa sổ thì cập nhật nó thay vì thêm (PM2-22). `type` thuộc `TASK_ACTIVITY_TYPES`.
 */
export class TaskActivityWriter {
  private readonly mutex = new KeyedMutex();

  constructor(
    private readonly repo: ITaskActivityRepository,
    private readonly clock: () => Date = () => new Date()
  ) {}

  record(tx: TxContext, input: Omit<TaskActivityInput, "groupKey"> & { groupKey?: string | null }): Promise<TaskActivity> {
    return this.repo.create({ ...input, groupKey: input.groupKey ?? null }, tx);
  }

  /**
   * Trả bản ghi (mới hoặc đã gộp). Xếp hàng theo `taskId` trong tiến trình để hai lời gọi cùng người/cùng thẻ không
   * sinh hai bản ghi song song; giữa nhiều instance có thể hiếm khi ra hai bản ghi — vô hại (chỉ là hai dòng nhật ký).
   */
  recordGrouped(
    input: Omit<TaskActivityInput, "groupKey">,
    groupKey: string,
    merge: GroupMerge,
    windowMs: number = ACTIVITY_GROUP_WINDOW_MS
  ): Promise<TaskActivity> {
    return this.mutex.run(input.taskId, async () => {
      const latest = await this.repo.findLatest(input.taskId);
      if (latest && latest.groupKey === groupKey && this.clock().getTime() - latest.at.getTime() < windowMs) {
        const updated = await this.repo.updateGrouped(latest.id, merge(latest));
        if (updated) return updated;
      }
      return this.repo.create({ ...input, groupKey });
    });
  }
}
