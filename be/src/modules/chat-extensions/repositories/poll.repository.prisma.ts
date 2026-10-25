import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { PollCloseReason, PollCreateInput, PollEntity } from "../entities/chat-extensions.types";
import type { IPollRepository, PollCountsPatch } from "./poll.repository.interface";
import type { TxHandle } from "./tx";

type PollRecord = Prisma.PollGetPayload<Record<string, never>>;

const db = (tx?: TxHandle) => tx ?? prisma;

export function mapPoll(r: PollRecord): PollEntity {
  return {
    id: r.id,
    messageId: r.messageId,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    threadId: r.threadId ?? null,
    workspaceId: r.workspaceId ?? null,
    createdBy: r.createdBy,
    question: r.question,
    normalizedQuestion: r.normalizedQuestion,
    options: r.options.map((o) => ({ id: o.id, text: o.text, voteCount: o.voteCount, addedBy: o.addedBy ?? null })),
    multi: r.multi,
    anonymous: r.anonymous,
    allowAddOptions: r.allowAddOptions,
    closesAt: r.closesAt ?? null,
    status: r.status,
    closedAt: r.closedAt ?? null,
    closedBy: r.closedBy ?? null,
    closeReason: (r.closeReason ?? null) as PollCloseReason | null,
    voterCount: r.voterCount,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const storedOptions = (options: PollCountsPatch["options"]) => options.map((o) => ({ id: o.id, text: o.text, voteCount: o.voteCount, addedBy: o.addedBy }));

export class PrismaPollRepository implements IPollRepository {
  async create(input: PollCreateInput, tx: TxHandle): Promise<PollEntity> {
    const r = await tx.poll.create({
      data: {
        messageId: input.messageId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        threadId: input.threadId,
        workspaceId: input.workspaceId,
        createdBy: input.createdBy,
        question: input.question,
        normalizedQuestion: input.normalizedQuestion,
        options: storedOptions(input.options),
        multi: input.multi,
        anonymous: input.anonymous,
        closesAt: input.closesAt,
        // Quy ước Mongo: mọi trường nullable sau này lọc bằng `{field: null}` phải ghi null TƯỜNG MINH.
        closedAt: null,
        closedBy: null,
        closeReason: null,
      },
    });
    return mapPoll(r);
  }

  async findById(id: string, tx?: TxHandle): Promise<PollEntity | null> {
    const r = await db(tx).poll.findUnique({ where: { id } });
    return r ? mapPoll(r) : null;
  }

  async findByMessageId(messageId: string, tx?: TxHandle): Promise<PollEntity | null> {
    const r = await db(tx).poll.findUnique({ where: { messageId } });
    return r ? mapPoll(r) : null;
  }

  async findByMessageIds(messageIds: string[]): Promise<PollEntity[]> {
    if (messageIds.length === 0) return [];
    const rows = await prisma.poll.findMany({ where: { messageId: { in: messageIds } } });
    return rows.map(mapPoll);
  }

  async updateCounts(id: string, expectedVersion: number, patch: PollCountsPatch, tx: TxHandle): Promise<PollEntity | null> {
    const result = await tx.poll.updateMany({
      where: { id, version: expectedVersion, status: "OPEN" },
      data: { options: storedOptions(patch.options), voterCount: patch.voterCount, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async close(id: string, input: { reason: PollCloseReason; closedBy: string | null; at: Date }, tx?: TxHandle): Promise<PollEntity | null> {
    const result = await db(tx).poll.updateMany({
      where: { id, status: "OPEN" },
      data: { status: "CLOSED", closedAt: input.at, closedBy: input.closedBy, closeReason: input.reason, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async replaceCounts(id: string, patch: PollCountsPatch, tx?: TxHandle): Promise<PollEntity | null> {
    const result = await db(tx).poll.updateMany({
      where: { id },
      data: { options: storedOptions(patch.options), voterCount: patch.voterCount, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async findDueToClose(now: Date, limit: number): Promise<PollEntity[]> {
    // ⚠ Prisma+Mongo: `lte` trên trường nullable khớp cả `null` ⇒ luôn kèm `not: null`.
    const rows = await prisma.poll.findMany({ where: { status: "OPEN", closesAt: { lte: now, not: null } }, orderBy: { closesAt: "asc" }, take: limit });
    return rows.map(mapPoll);
  }
}
