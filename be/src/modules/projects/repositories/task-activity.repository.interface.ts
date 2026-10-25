import type { TaskActivity, TaskActivityInput } from "../entities/task.interface";
import type { TxContext } from "./unit-of-work";

export interface TaskActivityPage {
  items: TaskActivity[];
  hasMore: boolean;
}

export interface ITaskActivityRepository {
  /** Ghi trong CÙNG transaction với thay đổi thẻ khi có `tx`; không `tx` (checklist nguyên tử) thì ghi độc lập. */
  create(input: TaskActivityInput, tx?: TxContext): Promise<TaskActivity>;
  /** Ghi nhiều bản ghi bằng MỘT lệnh (dời lịch hàng trăm thẻ trong transaction có timeout); trả bản ghi kèm `id`/`at` đã cấp. */
  createMany(inputs: TaskActivityInput[], tx?: TxContext): Promise<TaskActivity[]>;
  /** Bản ghi MỚI NHẤT của thẻ (theo `at`, `id`) — để gộp activity checklist cùng người trong cửa sổ 60 s. */
  findLatest(taskId: string, tx?: TxContext): Promise<TaskActivity | null>;
  /** Cập nhật `type`/`after` của bản ghi đã gộp (giữ `at` gốc: khoá phân trang cursor không bị xê dịch). */
  updateGrouped(id: string, patch: { type: string; after: Record<string, unknown> | null }, tx?: TxContext): Promise<TaskActivity | null>;
  /** Mới → cũ theo `(at, id)`; `cursor` = bản ghi cuối của trang trước. */
  list(taskId: string, cursor: { at: Date; id: string } | null, limit: number): Promise<TaskActivityPage>;
}
