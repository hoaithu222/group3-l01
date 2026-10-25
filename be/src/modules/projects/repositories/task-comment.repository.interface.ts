import type {
  TaskComment,
  TaskCommentCreateInput,
  TaskCommentEditSet,
  TaskCommentPage,
  TaskCommentTombstone,
} from "../entities/task-comment.interface";
import type { TxContext } from "./unit-of-work";

/**
 * `create` ném lỗi này khi trùng `(authorId, clientCommentId)` (unique index). Sau lỗi unique, transaction Mongo ĐÃ hỏng —
 * nơi gọi phải bắt lỗi NGOÀI transaction rồi đọc lại bản cũ, không được làm tiếp trong cùng transaction.
 */
export class DuplicateCommentError extends Error {
  constructor() {
    super("Bình luận với clientCommentId này đã tồn tại");
    this.name = "DuplicateCommentError";
  }
}

export interface ITaskCommentRepository {
  /** Trả cả bình luận đã xoá mềm (tombstone) — nơi gọi tự quyết. */
  findById(id: string, tx?: TxContext): Promise<TaskComment | null>;
  /** Bình luận của `authorId` với `clientCommentId` (idempotent gửi lại). */
  findByClientId(authorId: string, clientCommentId: string, tx?: TxContext): Promise<TaskComment | null>;
  /** Ghi `null` tường minh cho `editedAt/deletedAt/deletedBy/deleteReason` (lọc `{field: null}` về sau). */
  create(input: TaskCommentCreateInput, tx: TxContext): Promise<TaskComment>;
  /** CAS `where { id, version, deletedAt: null }`, `version +1`; `null` khi lệch/đã xoá. */
  editCas(id: string, expectedVersion: number, set: TaskCommentEditSet, tx: TxContext): Promise<TaskComment | null>;
  /** Xoá mềm (chỉ khi chưa xoá), `version +1`; `null` khi không khớp (đã xoá/không còn). */
  tombstone(id: string, set: TaskCommentTombstone, tx: TxContext): Promise<TaskComment | null>;
  /** Mới → cũ theo `(createdAt, id)`, GỒM tombstone (giữ ngữ cảnh cuộc trao đổi). */
  list(taskId: string, cursor: { at: Date; id: string } | null, limit: number): Promise<TaskCommentPage>;
}
