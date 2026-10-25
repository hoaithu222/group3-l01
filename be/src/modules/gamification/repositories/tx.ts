import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";
import { notify, type NotifyInput } from "../../notifications/public";

/**
 * Tay cầm transaction + cổng outbox/thông báo của `gamification` — cùng mẫu `modules/study/repositories/{tx,ports}.ts`: service KHÔNG
 * import Prisma/`outbox`/`notify` trực tiếp mà nhận các cổng này (repository nhận `tx?: TxHandle`).
 */
export type TxHandle = Prisma.TransactionClient;

export interface ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

export class PrismaTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return withTransaction(fn);
  }
}

export interface IGamOutbox {
  /** `dedupeKey` outbox là unique — trùng ⇒ P2002 làm hỏng cả tx: caller KIỂM `exists` trước với khoá có thể lặp (level-up). */
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
  exists(tx: TxHandle, dedupeKey: string): Promise<boolean>;
}

export class PrismaGamOutbox implements IGamOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void> {
    return outbox.add(tx, event);
  }

  async exists(tx: TxHandle, dedupeKey: string): Promise<boolean> {
    return (await tx.outboxEvent.findUnique({ where: { dedupeKey }, select: { id: true } })) !== null;
  }
}

/** Tạo thông báo qua `notify()` (p0-06) trong transaction của caller. */
export interface IGamNotifier {
  notify(tx: TxHandle, input: NotifyInput): Promise<void>;
}

export class PrismaGamNotifier implements IGamNotifier {
  async notify(tx: TxHandle, input: NotifyInput): Promise<void> {
    await notify(tx, input);
  }
}

/**
 * Vi phạm unique index do ĐUA GHI (P2002) — repository đổi thành lỗi miền này. ⚠️ Trong transaction Mongo P2002 làm tx đã HỎNG: KHÔNG bắt rồi
 * chạy tiếp trong cùng `tx.run`; để lỗi thoát callback (rollback) rồi bắt Ở NGOÀI.
 */
export class UniqueViolationError extends Error {
  constructor(readonly key: string) {
    super(`Vi phạm unique: ${key}`);
    this.name = "UniqueViolationError";
  }
}

export function isPrismaUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
