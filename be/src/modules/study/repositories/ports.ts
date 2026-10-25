import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";
import { redis } from "../../../infrastructure/redis";
import { notify, type NotifyInput } from "../../notifications/public";
import type { TxHandle } from "./tx";

/**
 * Cổng phụ trợ của `study` (p4-02) — service KHÔNG import Prisma/`outbox`/`notify`/Redis trực tiếp: nhận các cổng này qua DI
 * (bản in-memory ghi lại lời gọi cho unit test). Cùng mẫu `IOutboxPort` của `modules/resources/repositories/tx.ts`.
 */
export interface IStudyOutbox {
  /** Ghi MỘT dòng outbox trong transaction của caller. `dedupeKey` trùng ⇒ P2002 làm hỏng cả tx — caller phải KIỂM `exists` trước. */
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
  /** Xoá dòng outbox CHƯA dispatch (huỷ job hẹn giờ). Đã dispatch ⇒ không làm gì (processor tự no-op nhờ CAS). */
  cancelPending(tx: TxHandle, dedupeKey: string): Promise<void>;
  exists(tx: TxHandle, dedupeKey: string): Promise<boolean>;
}

export class PrismaStudyOutbox implements IStudyOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void> {
    return outbox.add(tx, event);
  }

  async cancelPending(tx: TxHandle, dedupeKey: string): Promise<void> {
    await tx.outboxEvent.deleteMany({ where: { dedupeKey, status: "PENDING" } });
  }

  async exists(tx: TxHandle, dedupeKey: string): Promise<boolean> {
    return (await tx.outboxEvent.findUnique({ where: { dedupeKey }, select: { id: true } })) !== null;
  }
}

export class InMemoryStudyOutbox implements IStudyOutbox {
  readonly events: OutboxEventInput[] = [];

  add(_tx: TxHandle, event: OutboxEventInput): Promise<void> {
    if (this.events.some((e) => e.dedupeKey === event.dedupeKey)) return Promise.reject(new Error(`P2002 giả lập: dedupeKey trùng ${event.dedupeKey}`));
    this.events.push(event);
    return Promise.resolve();
  }

  cancelPending(_tx: TxHandle, dedupeKey: string): Promise<void> {
    const i = this.events.findIndex((e) => e.dedupeKey === dedupeKey);
    if (i >= 0) this.events.splice(i, 1);
    return Promise.resolve();
  }

  exists(_tx: TxHandle, dedupeKey: string): Promise<boolean> {
    return Promise.resolve(this.events.some((e) => e.dedupeKey === dedupeKey));
  }

  ofType(type: string): OutboxEventInput[] {
    return this.events.filter((e) => e.type === type);
  }
}

/** Tạo thông báo qua `notify()` (p0-06) trong transaction của caller — KHÔNG tự ghi `Notification`. */
export interface IStudyNotifier {
  notify(tx: TxHandle, input: NotifyInput): Promise<void>;
}

export class PrismaStudyNotifier implements IStudyNotifier {
  async notify(tx: TxHandle, input: NotifyInput): Promise<void> {
    await notify(tx, input);
  }
}

export class InMemoryStudyNotifier implements IStudyNotifier {
  readonly sent: NotifyInput[] = [];

  notify(_tx: TxHandle, input: NotifyInput): Promise<void> {
    if (!this.sent.some((n) => n.dedupeKey === input.dedupeKey)) this.sent.push(input);
    return Promise.resolve();
  }
}

/**
 * Khử trùng sự kiện ngắn hạn (`clientEventId` rời app) — Redis `SET NX`. `redis.setNx` trả `false` khi Redis mất kết nối ⇒ sự kiện
 * bị bỏ qua (chấp nhận: rời app chỉ để GHI NHẬN, không ảnh hưởng điểm); lỗi ném ra thì coi là sự kiện mới.
 */
export interface IEventDedupe {
  /** `true` = lần đầu thấy khoá (xử lý tiếp), `false` = đã thấy. */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
}

export class RedisEventDedupe implements IEventDedupe {
  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return await redis.setNx(key, "1", ttlSeconds);
    } catch {
      return true;
    }
  }
}

export class InMemoryEventDedupe implements IEventDedupe {
  private readonly seen = new Set<string>();

  claim(key: string): Promise<boolean> {
    if (this.seen.has(key)) return Promise.resolve(false);
    this.seen.add(key);
    return Promise.resolve(true);
  }
}
