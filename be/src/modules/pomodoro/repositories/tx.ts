import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";

/**
 * Tay cầm transaction — CHỈ là kiểu (`Prisma.TransactionClient`); service không gọi gì trên nó, chỉ chuyển tiếp cho repository/`IOutboxPort` (giữ
 * "service không import Prisma" mà vẫn có transaction NGUYÊN TỬ + `OutboxEvent`). ⚠ `withTransaction` có thể CHẠY LẠI `fn` khi gặp lỗi transient
 * (`WriteConflict`): mọi thứ ngoài DB trong `fn` phải idempotent, đọc-quyết-định-ghi phải nằm TRONG `fn`.
 */
export type TxHandle = Prisma.TransactionClient;

export interface ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

/** Ghi việc "sau commit" (job hẹn giờ, đồng bộ media) bền trong CÙNG transaction. */
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
