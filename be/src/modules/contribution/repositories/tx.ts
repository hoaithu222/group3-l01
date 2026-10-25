import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";
import { notify, type NotifyInput } from "../../notifications/public";

/**
 * Tay cầm transaction + cổng outbox/thông báo của `contribution` — cùng mẫu `gamification/repositories/tx.ts`: service KHÔNG import
 * Prisma/`outbox`/`notify` trực tiếp mà nhận các cổng này (repository nhận `tx?: TxHandle`).
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

export interface IContribOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
}

export class PrismaContribOutbox implements IContribOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void> {
    return outbox.add(tx, event);
  }
}

/** Tạo thông báo qua `notify()` (p0-06) trong transaction của caller. */
export interface IContribNotifier {
  notify(tx: TxHandle, input: NotifyInput): Promise<void>;
  /** `Notification.dedupeKey` đã tồn tại chưa — `notify()` idempotent nhưng job kiểm trước để khỏi ghi lại khi retry. */
  exists(tx: TxHandle, dedupeKey: string): Promise<boolean>;
}

export class PrismaContribNotifier implements IContribNotifier {
  async notify(tx: TxHandle, input: NotifyInput): Promise<void> {
    await notify(tx, input);
  }

  async exists(tx: TxHandle, dedupeKey: string): Promise<boolean> {
    return (await tx.notification.findUnique({ where: { dedupeKey }, select: { id: true } })) !== null;
  }
}

/**
 * Vi phạm unique index do ĐUA GHI (P2002). ⚠ Trong transaction Mongo, P2002 làm tx đã HỎNG: KHÔNG bắt rồi chạy tiếp trong cùng `tx.run`;
 * mọi ghi có thể đua ở module này (fact, ô heatmap, state) đều chạy NGOÀI transaction và tự thử lại bằng `updateMany`.
 */
export function isPrismaUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Lỗi unique của bản in-memory (test) — cùng ý nghĩa với P2002 của Prisma. */
export class UniqueViolationError extends Error {}

/** P2002 (Prisma) hoặc `UniqueViolationError` (in-memory). */
export function isUniqueViolation(err: unknown): boolean {
  return isPrismaUniqueViolation(err) || err instanceof UniqueViolationError;
}
