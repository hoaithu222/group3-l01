import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";
import { notify, type NotifyInput } from "../../notifications/public";

/**
 * Tay cầm transaction + cổng outbox/thông báo của `portfolio` (mẫu `career/repositories/tx.ts`): service KHÔNG import Prisma/`outbox`/`notify` trực tiếp.
 * Repository nhận `tx?: TxHandle` (vắng = client gốc); bản in-memory bỏ qua `tx`.
 */
export type TxHandle = Prisma.TransactionClient;

export interface ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

export class PrismaTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return withTransaction(fn);
  }
}

export interface IPortfolioOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
}

export class PrismaPortfolioOutbox implements IPortfolioOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void> {
    return outbox.add(tx, event);
  }
}

export interface IPortfolioNotifier {
  notify(tx: TxHandle, input: NotifyInput): Promise<void>;
}

export class PrismaPortfolioNotifier implements IPortfolioNotifier {
  async notify(tx: TxHandle, input: NotifyInput): Promise<void> {
    await notify(tx, input);
  }
}

/**
 * Vi phạm unique index do ĐUA GHI (P2002) — repository đổi thành lỗi miền này. ⚠ Trong transaction Mongo P2002 làm tx HỎNG: KHÔNG bắt rồi chạy tiếp trong cùng
 * `tx.run`; để lỗi thoát callback (rollback) rồi bắt Ở NGOÀI.
 */
export class UniqueViolationError extends Error {
  constructor(readonly key: string) {
    super(`Vi phạm unique: ${key}`);
    this.name = "UniqueViolationError";
  }
}

export function isPrismaUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Chạy `op`; P2002 → `UniqueViolationError(key)`. */
export async function mapUnique<T>(key: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isPrismaUniqueViolation(err)) throw new UniqueViolationError(key);
    throw err;
  }
}
