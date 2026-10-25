import type { Task } from "../entities/task.interface";
import type { TxContext } from "./unit-of-work";

/** Đua tạo CÙNG cạnh (P2002) — ném ra khỏi transaction; service đọc lại cạnh NGOÀI transaction (idempotent). */
export class DuplicateDependencyError extends Error {
  constructor() {
    super("TaskDependency đã tồn tại");
    this.name = "DuplicateDependencyError";
  }
}

/** Cạnh phụ thuộc FINISH_TO_START `predecessorId → successorId` (p4-04 be.md §2). */
export interface TaskDependency {
  id: string;
  workspaceId: string;
  boardId: string;
  predecessorId: string;
  successorId: string;
  type: "FINISH_TO_START";
  createdBy: string;
  createdAt: Date;
}

export interface TaskDependencyCreateInput {
  workspaceId: string;
  boardId: string;
  predecessorId: string;
  successorId: string;
  createdBy: string;
}

export interface ITaskDependencyRepository {
  find(predecessorId: string, successorId: string, tx?: TxContext): Promise<TaskDependency | null>;
  /** Số thẻ trước của `successorId` (cạnh vào). */
  countPredecessors(successorId: string, tx?: TxContext): Promise<number>;
  /** Số thẻ sau của `predecessorId` (cạnh ra). */
  countSuccessors(predecessorId: string, tx?: TxContext): Promise<number>;
  /** Cạnh ra của MỘT LÔ đỉnh (BFS theo lô) — tối đa `limit` cạnh. */
  outgoing(predecessorIds: string[], limit: number, tx?: TxContext): Promise<Pick<TaskDependency, "predecessorId" | "successorId">[]>;
  /** Cạnh vào của MỘT LÔ đỉnh — tối đa `limit` cạnh (thẻ trước nằm ngoài đồ thị con khi dời lịch). */
  incoming(successorIds: string[], limit: number, tx?: TxContext): Promise<Pick<TaskDependency, "predecessorId" | "successorId">[]>;
  /** Cạnh vào + cạnh ra của một thẻ (mới → cũ). */
  listForTask(taskId: string): Promise<{ predecessors: TaskDependency[]; successors: TaskDependency[] }>;
  /** Có thể ném lỗi P2002 (đua tạo cùng cạnh) — service xử lý NGOÀI transaction. */
  create(input: TaskDependencyCreateInput, tx: TxContext): Promise<TaskDependency>;
  /** Trả số cạnh đã xoá (0 | 1). */
  delete(predecessorId: string, successorId: string, tx: TxContext): Promise<number>;
  /**
   * ĐẾM LẠI từ cạnh (không ±1 — chạy lặp vô hại, be.md §5.8): `blockedByCount` = thẻ trước chưa xoá, chưa DONE;
   * `blockingCount` = thẻ sau chưa xoá, chưa DONE; `version+1`. Trả thẻ sau cập nhật, `null` nếu thẻ đã xoá.
   */
  recount(taskId: string, tx: TxContext): Promise<Task | null>;
  /** Như `recount` nhưng CHỈ ghi (và `version+1`) khi bộ đếm khác giá trị đang lưu; trả thẻ đã đổi hoặc `null`. */
  recountIfChanged(taskId: string, tx?: TxContext): Promise<Task | null>;
  /** (Gantt) Thẻ chưa xoá của bảng có khoảng [start ?? due, due ?? start] giao [from, to] — tối đa `limit` thẻ. */
  boardTasksInRange(boardId: string, from: Date, to: Date, limit: number): Promise<Task[]>;
  /** (Gantt) Cạnh có CẢ hai đầu thuộc `ids`. */
  edgesAmong(ids: string[]): Promise<Pick<TaskDependency, "predecessorId" | "successorId">[]>;
  /** Thẻ CHƯA xoá theo danh sách id (cho danh sách phụ thuộc). */
  liveTasks(ids: string[]): Promise<Task[]>;
  /** (Cron đối soát) Id bảng có ≥ 1 cạnh, tăng dần, sau `afterBoardId` (`null` = từ đầu) — tối đa `limit`. */
  boardIdsWithEdges(afterBoardId: string | null, limit: number): Promise<string[]>;
  /** Cạnh của một bảng (chỉ số `boardId`) — tối đa `limit`. Dùng cho cron đối soát và bộ tải cạnh BFS (`dependency-edge-loader.ts`). */
  edgesOfBoard(boardId: string, limit: number, tx?: TxContext): Promise<Pick<TaskDependency, "predecessorId" | "successorId">[]>;
  /** (Cron đối soát) Thẻ chưa xoá của bảng có `blockedByCount > 0` hoặc `blockingCount > 0` — bắt bộ đếm "mồ côi" khi cạnh đã mất. */
  tasksWithNonZeroCounts(boardId: string): Promise<Task[]>;
}
