import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { MessageReactorEntry, MessageScopeTypeValue } from "../entities/message.interface";
import type { IReactionRepository, PrismaOrTx } from "./reaction.repository.interface";

function client(c?: PrismaOrTx) {
  return c ?? prisma;
}

export class PrismaReactionRepository implements IReactionRepository {
  /**
   * ⚠️ KHÔNG catch `P2002` ở ĐÂY dù `(messageId,userId,emoji)` là idempotent
   * key — phát hiện qua integration test: MongoDB multi-document transaction
   * KHÔNG cho phép "bắt lỗi rồi tiếp tục dùng cùng session" như SQL (không
   * savepoint) — bắt `P2002` bên trong `tx` rồi để service gọi THÊM operation
   * khác trong CÙNG `tx` (đọc lại tin, `updateReactionsSummary`, `outbox.add`)
   * khiến session đã "nhiễm độc" ném `P2028` ("Transaction ... has been
   * aborted") ở lệnh KẾ TIẾP — `P2028` không nằm trong danh sách lỗi transient
   * của `withTransaction` nên KHÔNG được tự retry → 500 cho request thứ 2 của
   * 2 request React đồng thời cùng emoji. Để nguyên (không catch) — lỗi
   * `P2002` (không phải `P2028`) tự nhiên propagate ra NGOÀI `withTransaction`
   * (transaction đã trung thực abort, không có operation nào chạy tiếp theo
   * trong cùng session) — `MessageInteractionService.react()` bắt nó Ở ĐÓ
   * (giống pattern đã dùng đúng ở `message.service.ts#send()` cho
   * `dedupeKey`), coi là "đã react trước đó", đọc lại state hiện tại.
   */
  async add(
    tx: Prisma.TransactionClient,
    input: { messageId: string; scopeType: MessageScopeTypeValue; scopeId: string; userId: string; emoji: string }
  ): Promise<{ created: boolean }> {
    await tx.messageReaction.create({ data: input });
    return { created: true };
  }

  async remove(tx: Prisma.TransactionClient, messageId: string, userId: string, emoji: string): Promise<{ removed: boolean }> {
    const result = await tx.messageReaction.deleteMany({ where: { messageId, userId, emoji } });
    return { removed: result.count > 0 };
  }

  async deleteByMessage(tx: Prisma.TransactionClient, messageId: string): Promise<void> {
    await tx.messageReaction.deleteMany({ where: { messageId } });
  }

  async countDistinctEmoji(messageId: string, c?: PrismaOrTx): Promise<number> {
    const rows = await client(c).messageReaction.findMany({
      where: { messageId },
      select: { emoji: true },
      distinct: ["emoji"],
    });
    return rows.length;
  }

  async findMineByMessageIds(messageIds: string[], userId: string, c?: PrismaOrTx): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const rows = await client(c).messageReaction.findMany({
      where: { messageId: { in: messageIds }, userId },
      select: { messageId: true, emoji: true },
    });
    return new Set(rows.map((r) => `${r.messageId}:${r.emoji}`));
  }

  async listReactors(
    messageId: string,
    params: { emoji?: string; cursor?: Date; limit: number },
    c?: PrismaOrTx
  ): Promise<MessageReactorEntry[]> {
    const rows = await client(c).messageReaction.findMany({
      where: {
        messageId,
        ...(params.emoji && { emoji: params.emoji }),
        ...(params.cursor && { createdAt: { gt: params.cursor } }),
      },
      orderBy: { createdAt: "asc" },
      take: params.limit,
    });
    return rows.map((r) => ({ userId: r.userId, emoji: r.emoji, createdAt: r.createdAt }));
  }

  async summarize(messageId: string, c?: PrismaOrTx): Promise<{ emoji: string; count: number }[]> {
    const rows = await client(c).messageReaction.groupBy({
      by: ["emoji"],
      where: { messageId },
      _count: { _all: true },
    });
    return rows.map((r) => ({ emoji: r.emoji, count: r._count._all }));
  }
}
