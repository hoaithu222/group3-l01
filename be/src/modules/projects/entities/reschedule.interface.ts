/** Thực thể dời lịch nền (p4-04 be.md §2). Ngày có thể `null` ở tầng domain; lưu trữ xử lý ở repository (xem `RescheduleBatch` Prisma). */
export type RescheduleBatchStatusValue = "QUEUED" | "RUNNING" | "DONE" | "PARTIAL" | "FAILED";

/** Trạng thái kết thúc — `activeKey` đã đổi sang `batch:<id>`, không còn chặn lệnh dời khác trên bảng. */
export const RESCHEDULE_FINAL_STATUSES: readonly RescheduleBatchStatusValue[] = ["DONE", "PARTIAL", "FAILED"];

export const isRescheduleFinal = (s: RescheduleBatchStatusValue): boolean => RESCHEDULE_FINAL_STATUSES.includes(s);

export type ReschedulePlanResult = "APPLIED" | "CONFLICT";

/**
 * Một thẻ trong kế hoạch dời (sắp tô-pô). `expectedVersion` = phiên bản thẻ lúc lập kế hoạch — áp bằng CAS theo giá trị này,
 * lệch ⇒ `CONFLICT` (thẻ đã bị sửa/xoá/hoàn thành giữa chừng).
 */
export interface ReschedulePlanItem {
  taskId: string;
  expectedVersion: number;
  oldStartDate: Date | null;
  oldDueDate: Date | null;
  newStartDate: Date | null;
  newDueDate: Date | null;
  assigneeIds: string[];
  result: ReschedulePlanResult | null;
}

export interface RescheduleBatch {
  id: string;
  workspaceId: string;
  boardId: string;
  sourceTaskId: string;
  requestedBy: string;
  sourceDueDate: Date;
  activeKey: string;
  status: RescheduleBatchStatusValue;
  items: ReschedulePlanItem[];
  affectedCount: number;
  /** Chỉ số item kế tiếp — chạy lại tiếp từ đây. */
  cursor: number;
  appliedCount: number;
  conflictCount: number;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface RescheduleBatchCreateInput {
  workspaceId: string;
  boardId: string;
  sourceTaskId: string;
  requestedBy: string;
  sourceDueDate: Date;
  items: ReschedulePlanItem[];
}

/** Một lô đang chạy mỗi bảng ở tầng DB: `activeKey` unique, chuỗi KHÔNG null (quy ước Mongo — conventions §3). */
export const activeBatchKey = (boardId: string): string => `board:${boardId}`;
export const finishedBatchKey = (batchId: string): string => `batch:${batchId}`;
