import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";

/**
 * Tay cầm transaction — CHỈ là kiểu; service chỉ chuyển tiếp cho repository/cổng (mẫu `modules/whiteboards/repositories/tx.ts`). Repo in-memory bỏ qua.
 * Giữ "service không import Prisma" mà vẫn transaction nguyên tử + `OutboxEvent`.
 */
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

/** Test: chạy `fn` ngay với tay cầm giả. KHÔNG hoàn tác khi lỗi — test in-memory chỉ kiểm nhánh chặn TRƯỚC khi ghi (nên service ghi bước dễ hỏng trước). */
export class InMemoryTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return fn({} as unknown as TxHandle);
  }
}

export class InMemoryOutboxPort implements IOutboxPort {
  readonly events: OutboxEventInput[] = [];

  add(_tx: TxHandle, event: OutboxEventInput): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}
