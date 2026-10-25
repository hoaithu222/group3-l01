import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";

/**
 * Tay cầm transaction của `burnout` — CHỈ là kiểu: service chuyển tiếp cho repository/cổng (mẫu `modules/chat-extensions/repositories/tx.ts`), giữ "service không import Prisma" mà vẫn
 * ghi cài đặt + đánh giá + thông báo + outbox trong MỘT transaction. Repo in-memory bỏ qua tay cầm.
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

/** Test: chạy `fn` ngay với tay cầm giả. KHÔNG hoàn tác khi lỗi — test chỉ kiểm nhánh chặn TRƯỚC khi ghi (service ghi bước dễ hỏng trước). */
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

/** Vi phạm unique (đua ghi) — repository xử lý bằng cách thử lại thao tác cập nhật. */
export function isPrismaUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
