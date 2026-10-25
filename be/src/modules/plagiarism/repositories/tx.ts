import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";

/** Tay cầm transaction — cùng mẫu `resources/repositories/tx.ts` (reuse-first.md). */
export type TxHandle = Prisma.TransactionClient;

export interface ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

export interface IOutboxPort {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
}

export class PrismaTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return withTransaction(fn);
  }
}

export class PrismaOutboxPort implements IOutboxPort {
  async add(tx: TxHandle, event: OutboxEventInput): Promise<void> {
    await outbox.add(tx, event);
  }
}
