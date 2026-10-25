import type {
  TaskComment,
  TaskCommentCreateInput,
  TaskCommentEditSet,
  TaskCommentPage,
  TaskCommentTombstone,
} from "../entities/task-comment.interface";
import { DuplicateCommentError, type ITaskCommentRepository } from "./task-comment.repository.interface";

/** Repository in-memory — mô phỏng unique `(authorId, clientCommentId)` (Mongo in-memory không có unique index). */
export class InMemoryTaskCommentRepository implements ITaskCommentRepository {
  readonly comments = new Map<string, TaskComment>();
  private lastAt = 0;
  /** Đồng hồ (test cửa sổ sửa 15 phút tiêm bản giả). Mặc định giờ thật NHƯNG tăng ngặt — hai bình luận không trùng `createdAt`. */
  now: () => Date = () => {
    this.lastAt = Math.max(Date.now(), this.lastAt + 1);
    return new Date(this.lastAt);
  };

  async findById(id: string): Promise<TaskComment | null> {
    const c = this.comments.get(id);
    return c ? structuredClone(c) : null;
  }

  async findByClientId(authorId: string, clientCommentId: string): Promise<TaskComment | null> {
    const c = [...this.comments.values()].find((x) => x.authorId === authorId && x.clientCommentId === clientCommentId);
    return c ? structuredClone(c) : null;
  }

  async create(input: TaskCommentCreateInput): Promise<TaskComment> {
    if (await this.findByClientId(input.authorId, input.clientCommentId)) throw new DuplicateCommentError();
    const comment: TaskComment = {
      ...structuredClone(input),
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      version: 1,
      createdAt: this.now(),
    };
    this.comments.set(comment.id, comment);
    return structuredClone(comment);
  }

  async editCas(id: string, expectedVersion: number, set: TaskCommentEditSet): Promise<TaskComment | null> {
    const c = this.comments.get(id);
    if (!c || c.deletedAt !== null || c.version !== expectedVersion) return null;
    Object.assign(c, structuredClone(set), { version: c.version + 1 });
    return structuredClone(c);
  }

  async tombstone(id: string, set: TaskCommentTombstone): Promise<TaskComment | null> {
    const c = this.comments.get(id);
    if (!c || c.deletedAt !== null) return null;
    Object.assign(c, set, { version: c.version + 1 });
    return structuredClone(c);
  }

  async list(taskId: string, cursor: { at: Date; id: string } | null, limit: number): Promise<TaskCommentPage> {
    const rows = [...this.comments.values()]
      .filter((c) => c.taskId === taskId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .filter((c) => !cursor || c.createdAt < cursor.at || (c.createdAt.getTime() === cursor.at.getTime() && c.id < cursor.id));
    return { items: rows.slice(0, limit).map((c) => structuredClone(c)), hasMore: rows.length > limit };
  }
}
