import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type {
  DecodedCursor,
  ScheduledFailReason,
  ScheduledMentionEntity,
  ScheduledMessageCreateInput,
  ScheduledMessageEntity,
  ScheduledMessagePatch,
} from "../entities/chat-extensions.types";
import type { IScheduledMessageRepository, ScheduledListFilter } from "./scheduled-message.repository.interface";
import type { TxHandle } from "./tx";

type ScheduledRecord = Prisma.ScheduledMessageGetPayload<Record<string, never>>;

const db = (tx?: TxHandle) => tx ?? prisma;

/** Domain → Prisma (`MessageMention`): mention `ROLE` có `targetId` = "ADMIN"|"MEMBER" (không phải ObjectId) nên lưu ở `roleRef` — cùng quy ước với `messages`. */
const toStoredMentions = (mentions: ScheduledMentionEntity[]): Prisma.MessageMentionCreateInput[] =>
  mentions.map((m) =>
    m.type === "ROLE" ? { type: m.type, targetId: null, label: null, roleRef: m.targetId ?? null } : { type: m.type, targetId: m.targetId ?? null, label: null }
  );

export function mapScheduled(r: ScheduledRecord): ScheduledMessageEntity {
  return {
    id: r.id,
    authorId: r.authorId,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    threadId: r.threadId ?? null,
    workspaceId: r.workspaceId ?? null,
    content: r.content ?? null,
    mentions: r.mentions.map((m) => {
      const targetId = m.type === "ROLE" ? (m.roleRef ?? m.targetId) : m.targetId;
      return { type: m.type as ScheduledMentionEntity["type"], ...(targetId ? { targetId } : {}) };
    }),
    attachmentAssetIds: r.attachmentAssetIds,
    replyToId: r.replyToId ?? null,
    sendAt: r.sendAt,
    timezone: r.timezone,
    status: r.status,
    messageId: r.messageId ?? null,
    failReason: (r.failReason ?? null) as ScheduledFailReason | null,
    failCode: r.failCode ?? null,
    attempts: r.attempts,
    sentAt: r.sentAt ?? null,
    cancelledAt: r.cancelledAt ?? null,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Cửa sổ "SENDING đã kẹt": bản ghi mà `updatedAt` cũ hơn `staleBefore` (worker chết giữa chừng). */
const claimable = (staleBefore: Date): Prisma.ScheduledMessageWhereInput => ({ OR: [{ status: "PENDING" }, { status: "SENDING", updatedAt: { lt: staleBefore } }] });

export class PrismaScheduledMessageRepository implements IScheduledMessageRepository {
  async create(input: ScheduledMessageCreateInput, tx: TxHandle): Promise<ScheduledMessageEntity> {
    const r = await tx.scheduledMessage.create({
      data: {
        authorId: input.authorId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        threadId: input.threadId,
        workspaceId: input.workspaceId,
        content: input.content,
        mentions: toStoredMentions(input.mentions),
        attachmentAssetIds: input.attachmentAssetIds,
        replyToId: input.replyToId,
        sendAt: input.sendAt,
        timezone: input.timezone,
        // Quy ước Mongo: mọi trường nullable sau này lọc bằng `{field: null}` phải ghi null TƯỜNG MINH.
        messageId: null,
        failReason: null,
        failCode: null,
        sentAt: null,
        cancelledAt: null,
      },
    });
    return mapScheduled(r);
  }

  async findById(id: string, tx?: TxHandle): Promise<ScheduledMessageEntity | null> {
    const r = await db(tx).scheduledMessage.findUnique({ where: { id } });
    return r ? mapScheduled(r) : null;
  }

  countPending(authorId: string, tx?: TxHandle): Promise<number> {
    return db(tx).scheduledMessage.count({ where: { authorId, status: "PENDING" } });
  }

  async updateIfPending(id: string, authorId: string, expectedVersion: number, patch: ScheduledMessagePatch, tx: TxHandle): Promise<ScheduledMessageEntity | null> {
    const result = await tx.scheduledMessage.updateMany({
      where: { id, authorId, status: "PENDING", version: expectedVersion },
      data: {
        ...(patch.content !== undefined && { content: patch.content }),
        ...(patch.mentions !== undefined && { mentions: toStoredMentions(patch.mentions) }),
        ...(patch.attachmentAssetIds !== undefined && { attachmentAssetIds: patch.attachmentAssetIds }),
        ...(patch.replyToId !== undefined && { replyToId: patch.replyToId }),
        ...(patch.threadId !== undefined && { threadId: patch.threadId }),
        ...(patch.sendAt !== undefined && { sendAt: patch.sendAt }),
        ...(patch.timezone !== undefined && { timezone: patch.timezone }),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async cancel(id: string, authorId: string, at: Date, tx: TxHandle): Promise<ScheduledMessageEntity | null> {
    const result = await tx.scheduledMessage.updateMany({
      where: { id, authorId, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: at, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async claimForSend(id: string, expectedVersion: number, staleBefore: Date): Promise<ScheduledMessageEntity | null> {
    const result = await prisma.scheduledMessage.updateMany({
      where: { id, version: expectedVersion, ...claimable(staleBefore) },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async markSent(id: string, input: { messageId: string; at: Date }, tx: TxHandle): Promise<ScheduledMessageEntity | null> {
    const result = await tx.scheduledMessage.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "SENT", messageId: input.messageId, sentAt: input.at, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async markFailed(id: string, input: { reason: ScheduledFailReason; code: string | null; scrub?: boolean }, tx: TxHandle): Promise<ScheduledMessageEntity | null> {
    const result = await tx.scheduledMessage.updateMany({
      where: { id, status: "SENDING" },
      data: {
        status: "FAILED",
        failReason: input.reason,
        failCode: input.code,
        ...(input.scrub && { content: null, mentions: [], attachmentAssetIds: [] }),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async revertToPending(id: string): Promise<ScheduledMessageEntity | null> {
    const result = await prisma.scheduledMessage.updateMany({ where: { id, status: "SENDING" }, data: { status: "PENDING" } });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async listMine(authorId: string, filter: ScheduledListFilter, cursor: DecodedCursor | null, limit: number): Promise<ScheduledMessageEntity[]> {
    // Đang chờ: sắp phát sớm nhất trước; còn lại (đã gửi/lỗi/huỷ): mới nhất trước.
    const ascending = filter.status === "PENDING";
    const after = ascending
      ? { OR: [{ sendAt: { gt: cursor?.at } }, { sendAt: cursor?.at, id: { gt: cursor?.id } }] }
      : { OR: [{ sendAt: { lt: cursor?.at } }, { sendAt: cursor?.at, id: { lt: cursor?.id } }] };
    const rows = await prisma.scheduledMessage.findMany({
      where: {
        authorId,
        status: filter.status,
        ...(filter.scopeType && { scopeType: filter.scopeType }),
        ...(filter.scopeId && { scopeId: filter.scopeId }),
        ...(cursor && after),
      },
      orderBy: [{ sendAt: ascending ? "asc" : "desc" }, { id: ascending ? "asc" : "desc" }],
      take: limit,
    });
    return rows.map(mapScheduled);
  }

  async findStale(missedBefore: Date, staleBefore: Date, limit: number): Promise<ScheduledMessageEntity[]> {
    const rows = await prisma.scheduledMessage.findMany({
      where: { OR: [{ status: "PENDING", sendAt: { lt: missedBefore } }, { status: "SENDING", updatedAt: { lt: staleBefore } }] },
      orderBy: { sendAt: "asc" },
      take: limit,
    });
    return rows.map(mapScheduled);
  }

  async cancelPendingOfAuthor(authorId: string, at: Date, tx: TxHandle): Promise<ScheduledMessageEntity[]> {
    const pending = await tx.scheduledMessage.findMany({ where: { authorId, status: "PENDING" } });
    if (pending.length === 0) return [];
    await tx.scheduledMessage.updateMany({
      where: { authorId, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: at, content: null, mentions: [], attachmentAssetIds: [], version: { increment: 1 } },
    });
    return pending.map(mapScheduled);
  }
}
