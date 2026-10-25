import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { DecodedCursor, MessageReminderEntity, MessageReminderStatus, ReminderCreateInput } from "../entities/chat-extensions.types";
import type { IMessageReminderRepository } from "./message-reminder.repository.interface";
import type { TxHandle } from "./tx";

type ReminderRecord = Prisma.MessageReminderGetPayload<Record<string, never>>;

const db = (tx?: TxHandle) => tx ?? prisma;

export function mapReminder(r: ReminderRecord): MessageReminderEntity {
  return {
    id: r.id,
    userId: r.userId,
    messageId: r.messageId,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    workspaceId: r.workspaceId ?? null,
    remindAt: r.remindAt,
    timezone: r.timezone,
    status: r.status,
    firedAt: r.firedAt ?? null,
    unavailable: r.unavailable,
    notificationId: r.notificationId ?? null,
    cancelledAt: r.cancelledAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaMessageReminderRepository implements IMessageReminderRepository {
  async create(input: ReminderCreateInput, tx: TxHandle): Promise<MessageReminderEntity> {
    const r = await tx.messageReminder.create({
      data: {
        userId: input.userId,
        messageId: input.messageId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        workspaceId: input.workspaceId,
        remindAt: input.remindAt,
        timezone: input.timezone,
        // Quy ước Mongo: mọi trường nullable sau này lọc bằng `{field: null}` phải ghi null TƯỜNG MINH.
        firedAt: null,
        notificationId: null,
        cancelledAt: null,
      },
    });
    return mapReminder(r);
  }

  async findById(id: string, tx?: TxHandle): Promise<MessageReminderEntity | null> {
    const r = await db(tx).messageReminder.findUnique({ where: { id } });
    return r ? mapReminder(r) : null;
  }

  countPending(userId: string, tx?: TxHandle): Promise<number> {
    return db(tx).messageReminder.count({ where: { userId, status: "PENDING" } });
  }

  async cancel(id: string, userId: string, at: Date, tx?: TxHandle): Promise<MessageReminderEntity | null> {
    const result = await db(tx).messageReminder.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: at } });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async claimFire(id: string, input: { at: Date; unavailable: boolean }, tx: TxHandle): Promise<MessageReminderEntity | null> {
    const result = await tx.messageReminder.updateMany({ where: { id, status: "PENDING" }, data: { status: "FIRED", firedAt: input.at, unavailable: input.unavailable } });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async listMine(userId: string, status: Exclude<MessageReminderStatus, "CANCELLED">, cursor: DecodedCursor | null, limit: number): Promise<MessageReminderEntity[]> {
    const ascending = status === "PENDING";
    const after = ascending
      ? { OR: [{ remindAt: { gt: cursor?.at } }, { remindAt: cursor?.at, id: { gt: cursor?.id } }] }
      : { OR: [{ remindAt: { lt: cursor?.at } }, { remindAt: cursor?.at, id: { lt: cursor?.id } }] };
    const rows = await prisma.messageReminder.findMany({
      where: { userId, status, ...(cursor && after) },
      orderBy: [{ remindAt: ascending ? "asc" : "desc" }, { id: ascending ? "asc" : "desc" }],
      take: limit,
    });
    return rows.map(mapReminder);
  }

  async findMissed(missedBefore: Date, limit: number): Promise<MessageReminderEntity[]> {
    const rows = await prisma.messageReminder.findMany({ where: { status: "PENDING", remindAt: { lt: missedBefore } }, orderBy: { remindAt: "asc" }, take: limit });
    return rows.map(mapReminder);
  }

  async cancelPendingOfUser(userId: string, at: Date): Promise<number> {
    const result = await prisma.messageReminder.updateMany({ where: { userId, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: at } });
    return result.count;
  }
}
