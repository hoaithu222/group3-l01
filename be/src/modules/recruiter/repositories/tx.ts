import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox, type OutboxEventInput } from "../../../infrastructure/queue";
import { notify, type NotifyInput } from "../../notifications/public";

/**
 * Tay cầm transaction + cổng outbox/thông báo của `recruiter` (mẫu `portfolio/repositories/tx.ts`): service KHÔNG import Prisma/`outbox`/`notify` trực tiếp.
 * Repository nhận `tx?: TxHandle` (vắng = client gốc).
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

export interface IRecruiterOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void>;
}

export class PrismaRecruiterOutbox implements IRecruiterOutbox {
  add(tx: TxHandle, event: OutboxEventInput): Promise<void> {
    return outbox.add(tx, event);
  }
}

export interface IRecruiterNotifier {
  notify(tx: TxHandle, input: NotifyInput): Promise<void>;
}

export class PrismaRecruiterNotifier implements IRecruiterNotifier {
  async notify(tx: TxHandle, input: NotifyInput): Promise<void> {
    await notify(tx, input);
  }
}

/**
 * Vi phạm unique index do ĐUA GHI (P2002) — repository đổi thành lỗi miền này. ⚠ Trong transaction Mongo P2002 làm tx HỎNG: KHÔNG bắt rồi chạy tiếp trong cùng
 * `tx.run`; để lỗi thoát callback (rollback) rồi bắt Ở NGOÀI (xem `withUnique`).
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

/** Tên chỉ mục/trường bị vi phạm từ `meta.target` của P2002 (Mongo: tên index, vd `Company_nameKey_key`); rỗng khi không rõ. */
export function uniqueTarget(err: unknown): string {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return "";
  const t = (err.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(t) ? t.join(",") : typeof t === "string" ? t : "";
}

/** Chạy `op`; P2002 → `UniqueViolationError(key)` (key = `fallbackKey` khi Prisma không nêu tên chỉ mục). */
export async function mapUnique<T>(fallbackKey: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isPrismaUniqueViolation(err)) throw new UniqueViolationError(uniqueTarget(err) || fallbackKey);
    throw err;
  }
}
