import type { BoardTaskCounts, ColumnKindValue } from "../entities/board.interface";
import type {
  AdjacentDirection,
  ReviewStateValue,
  Task,
  TaskCreateInput,
  TaskListFilter,
  TaskMoveSet,
  TaskPatchSet,
  TaskRescheduleSet,
  TaskRestoreSet,
} from "../entities/task.interface";
import type { TxContext } from "./unit-of-work";

export interface ITaskRepository {
  /** Trả cả thẻ đã xoá mềm — service tự quyết (404 cho người dùng thường). */
  findById(id: string, tx?: TxContext): Promise<Task | null>;
  /** Thẻ chưa xoá theo id (mọi bảng) — chỉ dùng kiểm hàng xóm/nhãn; giữ thứ tự không đảm bảo. */
  findLiveByIds(ids: string[], tx?: TxContext): Promise<Task[]>;
  /** Ghi `null` tường minh cho `deletedAt/completedAt/dueDate/startDate/…` (quy ước Mongo). */
  create(input: TaskCreateInput, tx?: TxContext): Promise<Task>;
  /** Thẻ đã tạo bởi `createdBy` với `clientTaskId` (idempotent tạo thẻ). */
  findByClientTaskId(boardId: string, createdBy: string, clientTaskId: string, tx?: TxContext): Promise<Task | null>;
  /** Số thẻ chưa xoá của bảng (`TASK_010`). */
  countLive(boardId: string, tx?: TxContext): Promise<number>;
  /** Số thẻ chưa xoá trong một cột (`TASK_007`, đổi kind cột). */
  countInColumn(boardId: string, columnId: string, tx?: TxContext): Promise<number>;
  /** Khoá lớn nhất trong cột (không tính `excludeId`); `null` khi cột trống. */
  lastPosition(boardId: string, columnId: string, excludeId?: string, tx?: TxContext): Promise<string | null>;
  /** Thẻ liền kề (theo `position`, bỏ `excludeId`): `after` = ngay sau khoá, `before` = ngay trước. */
  adjacent(
    boardId: string,
    columnId: string,
    position: string,
    direction: AdjacentDirection,
    excludeId?: string,
    tx?: TxContext
  ): Promise<Task | null>;
  /** CAS `where { id, version, deletedAt: null }`, `version +1`; `null` khi lệch. */
  moveCas(id: string, expectedVersion: number, set: TaskMoveSet, tx?: TxContext): Promise<Task | null>;
  /** CAS `where { id, version, deletedAt: null }` cho `PATCH /tasks/:id`, `version +1`; `null` khi lệch/đã xoá. */
  patchCas(id: string, expectedVersion: number, set: TaskPatchSet, tx?: TxContext): Promise<Task | null>;
  /**
   * (p4-04) Dời lịch CAS `where { id, version, deletedAt: null, columnKind != DONE }`, `version +1` (+ `dueVersion +1` khi `bumpDueVersion`).
   * `false` khi lệch version / đã xoá / đã DONE — caller coi là xung đột. KHÔNG đọc lại thẻ (caller đọc theo lô sau commit).
   */
  applyReschedule(id: string, expectedVersion: number, set: TaskRescheduleSet, tx: TxContext): Promise<boolean>;
  /** Xoá mềm CAS theo `version` (chỉ khi chưa xoá), `version +1`; `null` khi lệch/đã xoá. */
  softDeleteCas(
    id: string,
    expectedVersion: number,
    set: { deletedAt: Date; deletedBy: string; deletedFromColumnId: string },
    tx: TxContext
  ): Promise<Task | null>;
  /** Khôi phục CAS theo `version` (chỉ khi ĐANG xoá): xoá `deletedAt/deletedBy/deletedFromColumnId`, `version +1`. */
  restoreCas(id: string, expectedVersion: number, set: TaskRestoreSet, tx: TxContext): Promise<Task | null>;
  /**
   * `attachmentCount ±1` + `version +1` nguyên tử. `+1` chỉ khi `attachmentCount < max`; `-1` chỉ khi `> 0`.
   * `null` khi không khớp (thẻ đã xoá, đủ/không còn tệp).
   */
  bumpAttachmentCount(id: string, delta: 1 | -1, max: number, tx: TxContext): Promise<Task | null>;
  /** `commentCount ±1` (không đổi `version`: bình luận không được làm `PATCH` đang soạn của người khác thành 409). */
  bumpCommentCount(id: string, delta: 1 | -1, tx: TxContext): Promise<Task | null>;
  /** Tối đa `limit` thẻ của một cột theo `(position, id)`, kèm bộ lọc. */
  listColumn(boardId: string, columnId: string, filter: TaskListFilter, limit: number, now: Date): Promise<Task[]>;
  /** Toàn bộ thẻ chưa xoá của cột theo `(position, id)` — cho rebalance. */
  listColumnAll(boardId: string, columnId: string, tx?: TxContext): Promise<Task[]>;
  /** Ghi lại `position` hàng loạt (không đổi `version`). Trả số thẻ đã đổi. */
  updatePositions(items: { id: string; position: string }[], tx: TxContext): Promise<number>;
  /** Đổi `columnKind` cho mọi thẻ của cột (đổi loại cột có thẻ, không phải DONE). */
  setColumnKind(boardId: string, columnId: string, kind: TaskMoveSet["columnKind"], tx: TxContext): Promise<number>;
  /** Số thẻ chưa xoá theo cột cho nhiều bảng — một truy vấn nhóm. */
  countsByBoard(boardIds: string[]): Promise<Map<string, BoardTaskCounts>>;
  /** Gỡ `labelId` khỏi `labelIds` của mọi thẻ trong bảng (kể cả đã xoá mềm); trả id thẻ chưa xoá bị ảnh hưởng. */
  pullLabel(boardId: string, labelId: string): Promise<string[]>;
  /** Số thẻ chưa xoá đang dùng nhãn. */
  countWithLabel(boardId: string, labelId: string): Promise<number>;
  /**
   * (p4-05) Ghi `reviewState` — KHÔNG đổi `version` (trạng thái duyệt không phải trường người dùng sửa; đổi `version` sẽ làm
   * lượt kéo Done ngay sau khi được duyệt gặp `RES_003` nếu client chưa kịp nhận socket). `false` khi không còn thẻ.
   */
  setReviewState(id: string, state: ReviewStateValue, tx?: TxContext): Promise<boolean>;
  /** (p4-05) Thẻ chưa xoá của bảng đang ở cột loại `kind`, theo `id` tăng dần sau `afterId` — quét bù/backfill theo lô. */
  listLiveByKind(boardId: string, kind: ColumnKindValue, afterId: string | null, limit: number, tx?: TxContext): Promise<Task[]>;
}
