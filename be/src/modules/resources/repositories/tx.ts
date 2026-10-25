import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";

/**
 * Tay cầm transaction — CHỈ là kiểu (`Prisma.TransactionClient`); service không gọi được gì trên nó, chỉ chuyển
 * tiếp cho repository/`IOutboxPort`. Repo in-memory bỏ qua. Cách này giữ "service không import Prisma" mà vẫn có
 * transaction NGUYÊN TỬ giữa nhiều collection + `OutboxEvent` (mẫu `withTransaction` + `outbox.add`, reuse-first.md).
 */
export type TxHandle = Prisma.TransactionClient;

export interface ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

/** Ghi việc "sau commit" (`resource.*`/`folder.*` → consumer `resource.events`) bền trong CÙNG transaction. */
export interface IOutboxPort {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
  /** Ghi nhiều sự kiện bằng ÍT round-trip (xoá/khôi phục cả thư mục hàng trăm tệp trong 1 transaction có timeout). */
  addMany(tx: TxHandle, events: OutboxEventInput[]): Promise<void>;
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

  /**
   * Sự kiện đầu đi qua `outbox.add` (đánh dấu transaction để `withTransaction` PUBLISH tín hiệu relay sau commit),
   * phần còn lại `createMany` MỘT lệnh — cùng dạng hàng như `outbox.writer.ts` (`schemaVersion: 1` + payload).
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

/** Test: chạy `fn` ngay với tay cầm giả, ghi sự kiện outbox vào mảng. */
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

  addMany(_tx: TxHandle, events: OutboxEventInput[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
}
