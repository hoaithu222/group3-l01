import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { IQuizOutbox, ITxRunner, TxHandle } from "./tx";

/** Thành phần tham gia transaction giả — chụp trạng thái trước, hoàn tác khi `fn` ném lỗi (giống rollback thật). */
export interface Restorable {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

/** Outbox trong bộ nhớ: gom sự kiện + cưỡng chế `dedupeKey` unique như `OutboxEvent.dedupeKey @unique` (trùng → ném lỗi). */
export class InMemoryQuizOutbox implements IQuizOutbox, Restorable {
  events: OutboxEventInput[] = [];

  snapshot(): OutboxEventInput[] {
    return [...this.events];
  }

  restore(snapshot: unknown): void {
    this.events = snapshot as OutboxEventInput[];
  }

  async add(_tx: TxHandle, event: OutboxEventInput): Promise<void> {
    if (event.dedupeKey && this.events.some((e) => e.dedupeKey === event.dedupeKey)) throw new Error(`Duplicate outbox dedupeKey ${event.dedupeKey}`);
    this.events.push(event);
  }

  async addMany(tx: TxHandle, events: OutboxEventInput[]): Promise<void> {
    for (const e of events) await this.add(tx, e);
  }
}

/** `ITxRunner` giả: chạy `fn`, lỗi → hoàn tác mọi thành phần đã đăng ký (repository + outbox). `failNext` mô phỏng worker chết giữa chừng. */
export class InMemoryTxRunner implements ITxRunner {
  /** Số lần `run` kế tiếp sẽ ném lỗi SAU khi `fn` chạy xong (mô phỏng crash trước commit → toàn bộ bị hoàn tác). */
  failAfterRun = 0;

  constructor(private readonly parts: Restorable[]) {}

  async run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    const saved = this.parts.map((p) => p.snapshot());
    try {
      const out = await fn({} as TxHandle);
      if (this.failAfterRun > 0) {
        this.failAfterRun -= 1;
        throw new Error("Giả lập: crash trước commit");
      }
      return out;
    } catch (err) {
      this.parts.forEach((p, i) => p.restore(saved[i]));
      throw err;
    }
  }
}
