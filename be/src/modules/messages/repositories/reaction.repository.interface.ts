import type { Prisma, PrismaClient } from "@prisma/client";
import type { MessageReactorEntry, MessageScopeTypeValue } from "../entities/message.interface";

export type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface IReactionRepository {
  /**
   * `create` — `(messageId,userId,emoji)` đã tồn tại → NÉM `P2002` ra ngoài
   * (KHÔNG tự bắt bên trong `tx`, xem docstring `reaction.repository.prisma.ts#add`
   * — bắt lỗi rồi tiếp tục dùng transaction Mongo đã nhiễm độc gây `P2028` ở
   * lệnh kế tiếp). Caller (`message-interaction.service.ts#react`) bắt `P2002`
   * NGOÀI `withTransaction()` để coi là idempotent (be.md §5.5).
   */
  add(
    tx: Prisma.TransactionClient,
    input: { messageId: string; scopeType: MessageScopeTypeValue; scopeId: string; userId: string; emoji: string }
  ): Promise<{ created: boolean }>;
  remove(tx: Prisma.TransactionClient, messageId: string, userId: string, emoji: string): Promise<{ removed: boolean }>;
  deleteByMessage(tx: Prisma.TransactionClient, messageId: string): Promise<void>;
  countDistinctEmoji(messageId: string, c?: PrismaOrTx): Promise<number>;
  /** Reaction hiện có của `userId` trên các `messageId` — dùng cho `reactions.me` khi list trang tin (be.md §5.2). */
  findMineByMessageIds(messageIds: string[], userId: string, c?: PrismaOrTx): Promise<Set<string>>;
  listReactors(
    messageId: string,
    params: { emoji?: string; cursor?: Date; limit: number },
    c?: PrismaOrTx
  ): Promise<MessageReactorEntry[]>;
  /** Đếm lại `reactionsSummary` từ `MessageReaction` — dùng bởi cron `messages.reactions-rebuild` (be.md §7). */
  summarize(messageId: string, c?: PrismaOrTx): Promise<{ emoji: string; count: number }[]>;
}
