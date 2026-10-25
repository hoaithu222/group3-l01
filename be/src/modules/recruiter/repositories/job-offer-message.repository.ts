import type { JobOfferMessage as PrismaMessage } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { JobOfferMessage, OfferMessageSide } from "../entities/recruiter.interface";
import { mapUnique, type TxHandle } from "./tx";

export interface OfferMessageCreateInput {
  id: string;
  offerId: string;
  authorId: string;
  side: OfferMessageSide;
  content: string;
  clientMessageId: string;
}

export interface IJobOfferMessageRepository {
  /** P2002 `[authorId, clientMessageId]` → `UniqueViolationError` (gửi lại cùng id → service trả bản cũ). */
  create(input: OfferMessageCreateInput, tx?: TxHandle): Promise<JobOfferMessage>;
  findByClientId(authorId: string, clientMessageId: string): Promise<JobOfferMessage | null>;
  /** Mới → cũ, cursor `(createdAt, id)`; đã ẩn (`deletedAt`) bị bỏ. */
  list(offerId: string, before: { at: Date; id: string } | undefined, take: number): Promise<JobOfferMessage[]>;
}

const toMessage = (r: PrismaMessage): JobOfferMessage => ({
  id: r.id,
  offerId: r.offerId,
  authorId: r.authorId,
  side: r.side,
  content: r.content,
  clientMessageId: r.clientMessageId,
  createdAt: r.createdAt,
});

export class PrismaJobOfferMessageRepository implements IJobOfferMessageRepository {
  create(input: OfferMessageCreateInput, tx?: TxHandle): Promise<JobOfferMessage> {
    return mapUnique("clientMessageId", async () => toMessage(await (tx ?? prisma).jobOfferMessage.create({ data: { ...input, deletedAt: null } })));
  }

  async findByClientId(authorId: string, clientMessageId: string): Promise<JobOfferMessage | null> {
    const r = await prisma.jobOfferMessage.findUnique({ where: { authorId_clientMessageId: { authorId, clientMessageId } } });
    return r ? toMessage(r) : null;
  }

  async list(offerId: string, before: { at: Date; id: string } | undefined, take: number): Promise<JobOfferMessage[]> {
    const rows = await prisma.jobOfferMessage.findMany({
      where: { offerId, deletedAt: null, ...(before ? { OR: [{ createdAt: { lt: before.at } }, { createdAt: before.at, id: { lt: before.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
    return rows.map(toMessage);
  }
}
