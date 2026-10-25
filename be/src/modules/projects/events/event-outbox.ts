import type { Prisma } from "@prisma/client";
import { outbox } from "../../../infrastructure/queue";
import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";
import { prismaTx } from "../repositories/prisma-tx";
import type { TxContext } from "../repositories/unit-of-work";

/** Cổng ghi outbox trong transaction — bản Prisma gọi `outbox.add`, bản in-memory (test) thu thập sự kiện. */
export interface IEventOutbox {
  add(tx: TxContext, event: OutboxEventInput): Promise<void>;
  /** Ghi nhiều sự kiện bằng ÍT round-trip (dời lịch hàng trăm thẻ trong một transaction có timeout). */
  addMany(tx: TxContext, events: OutboxEventInput[]): Promise<void>;
}

export class PrismaEventOutbox implements IEventOutbox {
  add(tx: TxContext, event: OutboxEventInput): Promise<void> {
    return outbox.add(prismaTx(tx), event);
  }

  /**
   * Sự kiện đầu qua `outbox.add` (đánh dấu transaction để `withTransaction` PUBLISH tín hiệu relay sau commit), phần còn lại
   * `createMany` MỘT lệnh — cùng dạng hàng như `outbox.writer.ts` (`schemaVersion: 1` + payload).
   */
  async addMany(tx: TxContext, events: OutboxEventInput[]): Promise<void> {
    const [first, ...rest] = events;
    if (!first) return;
    await outbox.add(prismaTx(tx), first);
    if (rest.length === 0) return;
    await prismaTx(tx).outboxEvent.createMany({
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
