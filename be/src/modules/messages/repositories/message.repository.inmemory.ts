import type { Prisma } from "@prisma/client";
import { newObjectId } from "../../../core/utils/object-id";
import type {
  DeleteModeValue,
  Message,
  MessageScopeTypeValue,
  MessageSourceRef,
  ReactionSummary,
} from "../entities/message.interface";
import { MESSAGE_SOURCE_REFS_MAX } from "../entities/message.interface";
import type {
  IMessageRepository,
  ListBySeqParams,
  MessageCreateInput,
  MessageEditData,
  PrismaOrTx,
} from "./message.repository.interface";

/**
 * Dùng cho unit test `MessageService` (không cần Mongo) — giữ đúng ngữ nghĩa
 * quan trọng của `PrismaMessageRepository`: `seq` cấp theo khoá
 * `(scopeType, scopeId, threadKey)`, `dedupeKey` unique, `updateForEdit` so
 * `version`, tombstone chỉ ghi 1 lần. KHÔNG mô phỏng transaction/rollback.
 */
export class InMemoryMessageRepository implements IMessageRepository {
  private readonly rows = new Map<string, Message>();
  private readonly counters = new Map<string, number>();

  async findById(id: string, _c?: PrismaOrTx): Promise<Message | null> {
    return this.rows.get(id) ?? null;
  }

  async findByIds(ids: string[], _c?: PrismaOrTx): Promise<Message[]> {
    return ids.map((id) => this.rows.get(id)).filter((m): m is Message => m !== undefined);
  }

  async findByDedupeKey(dedupeKey: string, _c?: PrismaOrTx): Promise<Message | null> {
    return [...this.rows.values()].find((m) => m.dedupeKey === dedupeKey) ?? null;
  }

  async listBySeq(params: ListBySeqParams, _c?: PrismaOrTx): Promise<Message[]> {
    const rows = [...this.rows.values()]
      .filter(
        (m) =>
          m.scopeType === params.scopeType &&
          m.scopeId === params.scopeId &&
          m.threadKey === params.threadKey &&
          (params.seqAbove === undefined || m.seq > params.seqAbove) &&
          (params.seqBelow === undefined || m.seq < params.seqBelow)
      )
      .sort((a, b) => (params.order === "asc" ? a.seq - b.seq : b.seq - a.seq));
    return rows.slice(0, params.limit);
  }

  async listPinned(scopeType: MessageScopeTypeValue, scopeId: string, _c?: PrismaOrTx): Promise<Message[]> {
    return [...this.rows.values()]
      .filter((m) => m.scopeType === scopeType && m.scopeId === scopeId && m.pinnedAt !== null)
      .sort((a, b) => (b.pinnedAt as Date).getTime() - (a.pinnedAt as Date).getTime());
  }

  async countPinned(scopeType: MessageScopeTypeValue, scopeId: string, c?: PrismaOrTx): Promise<number> {
    return (await this.listPinned(scopeType, scopeId, c)).length;
  }

  async nextSeq(
    _tx: Prisma.TransactionClient,
    scopeType: MessageScopeTypeValue,
    scopeId: string,
    threadKey: string
  ): Promise<number> {
    const key = `msg:${scopeType}:${scopeId}:${threadKey}`;
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async create(_tx: Prisma.TransactionClient, input: MessageCreateInput): Promise<Message> {
    if ([...this.rows.values()].some((m) => m.dedupeKey === input.dedupeKey)) {
      throw new Error(`dedupeKey trùng: ${input.dedupeKey}`);
    }
    const now = new Date();
    const message: Message = {
      id: newObjectId(),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      threadKey: input.threadKey,
      seq: input.seq,
      authorId: input.authorId,
      kind: input.kind,
      systemType: (input.systemType ?? null) as Message["systemType"],
      systemPayload: input.systemPayload ?? null,
      clientMessageId: input.clientMessageId,
      dedupeKey: input.dedupeKey,
      content: input.content,
      normalizedContent: input.normalizedContent,
      mentions: input.mentions,
      attachments: input.attachments,
      links: input.links,
      linkPreview: null,
      replyToId: input.replyToId ?? null,
      replyPreview: input.replyPreview ?? null,
      forwardedFrom: input.forwardedFrom ?? null,
      reactionsSummary: [],
      sourceRefs: [],
      pinnedAt: null,
      pinnedBy: null,
      editedAt: null,
      version: 1,
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      deleteMode: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(message.id, message);
    return message;
  }

  async updateSystemPayload(_tx: Prisma.TransactionClient, id: string, payload: Record<string, unknown>): Promise<{ version: number } | null> {
    const m = this.rows.get(id);
    if (!m || m.kind !== "SYSTEM" || m.deletedAt !== null) return null;
    const updated: Message = { ...m, systemPayload: payload, version: m.version + 1, updatedAt: new Date() };
    this.rows.set(id, updated);
    return { version: updated.version };
  }

  async addSourceRef(id: string, ref: MessageSourceRef): Promise<"ADDED" | "EXISTS" | "FULL" | "NOT_FOUND"> {
    const m = this.rows.get(id);
    if (!m) return "NOT_FOUND";
    if (m.sourceRefs.some((s) => s.kind === ref.kind && s.refId === ref.refId)) return "EXISTS";
    if (m.sourceRefs.length >= MESSAGE_SOURCE_REFS_MAX) return "FULL";
    this.rows.set(id, { ...m, sourceRefs: [...m.sourceRefs, ref] });
    return "ADDED";
  }

  async updateForEdit(
    _tx: Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
    data: MessageEditData
  ): Promise<{ count: number; editedAt: Date; version: number }> {
    const m = this.rows.get(id);
    const editedAt = new Date();
    if (!m || m.version !== expectedVersion || m.deletedAt !== null) return { count: 0, editedAt, version: expectedVersion };
    const updated: Message = { ...m, ...data, editedAt, version: m.version + 1, updatedAt: editedAt };
    this.rows.set(id, updated);
    return { count: 1, editedAt, version: updated.version };
  }

  async tombstone(
    _tx: Prisma.TransactionClient,
    id: string,
    actorId: string,
    mode: DeleteModeValue,
    reason: string | null,
    authorOnly: boolean
  ): Promise<{ count: number; deletedAt: Date }> {
    const m = this.rows.get(id);
    const deletedAt = new Date();
    if (!m || m.deletedAt !== null || (authorOnly && m.authorId !== actorId)) return { count: 0, deletedAt };
    this.rows.set(id, { ...m, deletedAt, deletedBy: actorId, deleteMode: mode, deleteReason: reason, pinnedAt: null, pinnedBy: null });
    return { count: 1, deletedAt };
  }

  async markReplyPreviewsDeleted(_tx: Prisma.TransactionClient, replyToId: string): Promise<void> {
    for (const [id, m] of this.rows) {
      if (m.replyToId === replyToId && m.replyPreview) {
        this.rows.set(id, { ...m, replyPreview: { ...m.replyPreview, deleted: true } });
      }
    }
  }

  async setPin(_tx: Prisma.TransactionClient, id: string, pinnedBy: string): Promise<{ count: number; pinnedAt: Date }> {
    const m = this.rows.get(id);
    const pinnedAt = new Date();
    if (!m || m.deletedAt !== null || m.pinnedAt !== null) return { count: 0, pinnedAt };
    this.rows.set(id, { ...m, pinnedAt, pinnedBy });
    return { count: 1, pinnedAt };
  }

  async clearPin(_tx: Prisma.TransactionClient, id: string): Promise<{ count: number }> {
    const m = this.rows.get(id);
    if (!m || m.pinnedAt === null) return { count: 0 };
    this.rows.set(id, { ...m, pinnedAt: null, pinnedBy: null });
    return { count: 1 };
  }

  async clearPinIfSet(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await this.clearPin(tx, id);
  }

  async updateReactionsSummary(_tx: Prisma.TransactionClient, id: string, summary: ReactionSummary[]): Promise<void> {
    const m = this.rows.get(id);
    if (m) this.rows.set(id, { ...m, reactionsSummary: summary });
  }

  async updateLinkPreview(_tx: Prisma.TransactionClient, id: string, linkPreview: Message["linkPreview"]): Promise<void> {
    const m = this.rows.get(id);
    if (m) this.rows.set(id, { ...m, linkPreview });
  }

  /** Chỉ test — chèn thẳng 1 tin (giữ nguyên `id`/`seq` do test cấp) và đẩy counter lên ít nhất `seq`. */
  seed(message: Message): void {
    this.rows.set(message.id, message);
    const key = `msg:${message.scopeType}:${message.scopeId}:${message.threadKey}`;
    this.counters.set(key, Math.max(this.counters.get(key) ?? 0, message.seq));
  }

  all(): Message[] {
    return [...this.rows.values()];
  }
}
