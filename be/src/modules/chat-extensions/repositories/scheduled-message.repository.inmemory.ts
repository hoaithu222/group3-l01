import { newObjectId } from "../../../core/utils/object-id";
import type {
  DecodedCursor,
  ScheduledFailReason,
  ScheduledMessageCreateInput,
  ScheduledMessageEntity,
  ScheduledMessagePatch,
} from "../entities/chat-extensions.types";
import type { IScheduledMessageRepository, ScheduledListFilter } from "./scheduled-message.repository.interface";
import type { TxHandle } from "./tx";

const clone = (m: ScheduledMessageEntity): ScheduledMessageEntity => ({
  ...m,
  mentions: m.mentions.map((x) => ({ ...x })),
  attachmentAssetIds: [...m.attachmentAssetIds],
});

/**
 * In-memory cho unit test — giữ ngữ nghĩa CAS của bản Prisma (điều kiện trạng thái/`version`/tác giả trong CÙNG một bước kiểm-và-ghi). `updatedAt` lấy từ đồng hồ test nên
 * "SENDING đã kẹt" kiểm được bằng cách đẩy đồng hồ.
 */
export class InMemoryScheduledMessageRepository implements IScheduledMessageRepository {
  private readonly rows = new Map<string, ScheduledMessageEntity>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  private save(m: ScheduledMessageEntity): ScheduledMessageEntity {
    this.rows.set(m.id, { ...m, updatedAt: this.clock() });
    return clone(this.rows.get(m.id) as ScheduledMessageEntity);
  }

  async create(input: ScheduledMessageCreateInput, _tx: TxHandle): Promise<ScheduledMessageEntity> {
    const now = this.clock();
    const created: ScheduledMessageEntity = {
      id: newObjectId(),
      ...input,
      mentions: input.mentions.map((m) => ({ ...m })),
      attachmentAssetIds: [...input.attachmentAssetIds],
      status: "PENDING",
      messageId: null,
      failReason: null,
      failCode: null,
      attempts: 0,
      sentAt: null,
      cancelledAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(created.id, created);
    return clone(created);
  }

  async findById(id: string, _tx?: TxHandle): Promise<ScheduledMessageEntity | null> {
    const m = this.rows.get(id);
    return m ? clone(m) : null;
  }

  async countPending(authorId: string, _tx?: TxHandle): Promise<number> {
    return [...this.rows.values()].filter((m) => m.authorId === authorId && m.status === "PENDING").length;
  }

  async updateIfPending(id: string, authorId: string, expectedVersion: number, patch: ScheduledMessagePatch, _tx: TxHandle): Promise<ScheduledMessageEntity | null> {
    const m = this.rows.get(id);
    if (!m || m.authorId !== authorId || m.status !== "PENDING" || m.version !== expectedVersion) return null;
    return this.save({
      ...m,
      ...(patch.content !== undefined && { content: patch.content }),
      ...(patch.mentions !== undefined && { mentions: patch.mentions }),
      ...(patch.attachmentAssetIds !== undefined && { attachmentAssetIds: patch.attachmentAssetIds }),
      ...(patch.replyToId !== undefined && { replyToId: patch.replyToId }),
      ...(patch.threadId !== undefined && { threadId: patch.threadId }),
      ...(patch.sendAt !== undefined && { sendAt: patch.sendAt }),
      ...(patch.timezone !== undefined && { timezone: patch.timezone }),
      version: m.version + 1,
    });
  }

  async cancel(id: string, authorId: string, at: Date, _tx: TxHandle): Promise<ScheduledMessageEntity | null> {
    const m = this.rows.get(id);
    if (!m || m.authorId !== authorId || m.status !== "PENDING") return null;
    return this.save({ ...m, status: "CANCELLED", cancelledAt: at, version: m.version + 1 });
  }

  async claimForSend(id: string, expectedVersion: number, staleBefore: Date): Promise<ScheduledMessageEntity | null> {
    const m = this.rows.get(id);
    if (!m || m.version !== expectedVersion) return null;
    const stuck = m.status === "SENDING" && m.updatedAt.getTime() < staleBefore.getTime();
    if (m.status !== "PENDING" && !stuck) return null;
    return this.save({ ...m, status: "SENDING", attempts: m.attempts + 1 });
  }

  async markSent(id: string, input: { messageId: string; at: Date }, _tx: TxHandle): Promise<ScheduledMessageEntity | null> {
    const m = this.rows.get(id);
    if (!m || m.status !== "SENDING") return null;
    return this.save({ ...m, status: "SENT", messageId: input.messageId, sentAt: input.at, version: m.version + 1 });
  }

  async markFailed(id: string, input: { reason: ScheduledFailReason; code: string | null; scrub?: boolean }, _tx: TxHandle): Promise<ScheduledMessageEntity | null> {
    const m = this.rows.get(id);
    if (!m || m.status !== "SENDING") return null;
    return this.save({
      ...m,
      status: "FAILED",
      failReason: input.reason,
      failCode: input.code,
      ...(input.scrub && { content: null, mentions: [], attachmentAssetIds: [] }),
      version: m.version + 1,
    });
  }

  async revertToPending(id: string): Promise<ScheduledMessageEntity | null> {
    const m = this.rows.get(id);
    if (!m || m.status !== "SENDING") return null;
    return this.save({ ...m, status: "PENDING" });
  }

  async listMine(authorId: string, filter: ScheduledListFilter, cursor: DecodedCursor | null, limit: number): Promise<ScheduledMessageEntity[]> {
    const asc = filter.status === "PENDING";
    return [...this.rows.values()]
      .filter((m) => m.authorId === authorId && m.status === filter.status)
      .filter((m) => !filter.scopeType || m.scopeType === filter.scopeType)
      .filter((m) => !filter.scopeId || m.scopeId === filter.scopeId)
      .sort((a, b) => (asc ? 1 : -1) * (a.sendAt.getTime() - b.sendAt.getTime() || (a.id < b.id ? -1 : 1)))
      .filter((m) => {
        if (!cursor) return true;
        const cmp = m.sendAt.getTime() - cursor.at.getTime() || (m.id < cursor.id ? -1 : m.id > cursor.id ? 1 : 0);
        return asc ? cmp > 0 : cmp < 0;
      })
      .slice(0, limit)
      .map(clone);
  }

  async findStale(missedBefore: Date, staleBefore: Date, limit: number): Promise<ScheduledMessageEntity[]> {
    return [...this.rows.values()]
      .filter(
        (m) =>
          (m.status === "PENDING" && m.sendAt.getTime() < missedBefore.getTime()) || (m.status === "SENDING" && m.updatedAt.getTime() < staleBefore.getTime())
      )
      .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())
      .slice(0, limit)
      .map(clone);
  }

  async cancelPendingOfAuthor(authorId: string, at: Date, _tx: TxHandle): Promise<ScheduledMessageEntity[]> {
    const cancelled: ScheduledMessageEntity[] = [];
    for (const m of [...this.rows.values()]) {
      if (m.authorId !== authorId || m.status !== "PENDING") continue;
      cancelled.push(clone(m));
      this.save({ ...m, status: "CANCELLED", cancelledAt: at, content: null, mentions: [], attachmentAssetIds: [], version: m.version + 1 });
    }
    return cancelled;
  }
}
