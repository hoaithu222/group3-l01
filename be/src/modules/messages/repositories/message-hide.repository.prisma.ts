import { prisma } from "../../../infrastructure/database";
import type { MessageScopeTypeValue } from "../entities/message.interface";
import type { IMessageHideRepository, PrismaOrTx } from "./message-hide.repository.interface";

function client(c?: PrismaOrTx) {
  return c ?? prisma;
}

export class PrismaMessageHideRepository implements IMessageHideRepository {
  async hide(
    input: { userId: string; messageId: string; scopeType: MessageScopeTypeValue; scopeId: string; seq: number },
    c?: PrismaOrTx
  ): Promise<void> {
    await client(c).messageHide.upsert({
      where: { userId_messageId: { userId: input.userId, messageId: input.messageId } },
      create: input,
      update: {},
    });
  }

  async unhide(userId: string, messageId: string, c?: PrismaOrTx): Promise<void> {
    await client(c).messageHide.deleteMany({ where: { userId, messageId } });
  }

  async isHidden(userId: string, messageId: string, c?: PrismaOrTx): Promise<boolean> {
    const row = await client(c).messageHide.findUnique({ where: { userId_messageId: { userId, messageId } } });
    return row !== null;
  }

  async findHiddenSeqs(
    userId: string,
    scopeType: MessageScopeTypeValue,
    scopeId: string,
    seqIn: number[],
    c?: PrismaOrTx
  ): Promise<Set<number>> {
    if (seqIn.length === 0) return new Set();
    const rows = await client(c).messageHide.findMany({
      where: { userId, scopeType, scopeId, seq: { in: seqIn } },
      select: { seq: true },
    });
    return new Set(rows.map((r) => r.seq));
  }
}
