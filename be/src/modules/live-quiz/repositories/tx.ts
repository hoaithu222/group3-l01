import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";

/** Tay cầm transaction — CHỈ là kiểu; service không gọi được gì trên nó, chỉ chuyển tiếp cho repository/outbox (cùng mẫu `study/repositories/tx.ts`). */
export type TxHandle = Prisma.TransactionClient;

export interface ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

export class PrismaTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return withTransaction(fn);
  }
}

export interface IQuizOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
  /** Ghi nhiều sự kiện bằng ÍT round-trip (mỗi người chơi một `quiz.scored`). */
  addMany(tx: TxHandle, events: OutboxEventInput[]): Promise<void>;
}

export class PrismaQuizOutbox implements IQuizOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void> {
    return outbox.add(tx, event);
  }

  /**
   * Sự kiện đầu qua `outbox.add` (đánh dấu transaction để `withTransaction` PUBLISH tín hiệu relay sau commit), phần còn lại
   * `createMany` MỘT lệnh — cùng dạng hàng như `outbox.writer.ts` (`schemaVersion: 1` + payload).
   */
  async addMany(tx: TxHandle, events: OutboxEventInput[]): Promise<void> {
    const [first, ...rest] = events;
    if (!first) return;
    await outbox.add(tx, first);
    if (rest.length === 0) return;
    await tx.outboxEvent.createMany({
      data: rest.map((e) => ({
        type: e.type,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        queue: e.queue,
        jobName: e.jobName,
        dedupeKey: e.dedupeKey,
        delayMs: e.delayMs,
        availableAt: e.availableAt ?? new Date(),
        payload: { schemaVersion: 1, ...e.payload } as Prisma.InputJsonValue,
      })),
    });
  }
}
