import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";

/** Tay cầm transaction — mẫu `modules/study/repositories/tx.ts` ("service không import Prisma"). */
export type TxHandle = Prisma.TransactionClient;

export interface ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

export class PrismaTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return withTransaction(fn);
  }
}

/** Cổng outbox (p4-07, RM-14) — mẫu `modules/documents/repositories/tx.ts`. `dedupeKey` trùng ⇒ P2002 hỏng cả tx (chấp nhận, cùng mức xử lý với `study/sr-review.service.ts`). */
export interface IOutboxPort {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
}

export class PrismaOutboxPort implements IOutboxPort {
  async add(tx: TxHandle, event: OutboxEventInput): Promise<void> {
    await outbox.add(tx, event);
  }
}
