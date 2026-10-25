import type { Prisma, PrismaClient } from "@prisma/client";
import type { MessageScopeTypeValue } from "../entities/message.interface";

export type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface IMessageHideRepository {
  /** Upsert — idempotent (be.md §5.5 `hide`). */
  hide(input: { userId: string; messageId: string; scopeType: MessageScopeTypeValue; scopeId: string; seq: number }, c?: PrismaOrTx): Promise<void>;
  unhide(userId: string, messageId: string, c?: PrismaOrTx): Promise<void>;
  isHidden(userId: string, messageId: string, c?: PrismaOrTx): Promise<boolean>;
  /** Tập `seq` đã ẩn của user trong 1 danh sách seq cụ thể — dùng lọc trang `list()` (be.md §5.2). */
  findHiddenSeqs(userId: string, scopeType: MessageScopeTypeValue, scopeId: string, seqIn: number[], c?: PrismaOrTx): Promise<Set<number>>;
}
