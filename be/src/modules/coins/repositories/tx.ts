import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";

/**
 * Tay cầm transaction của `coins` — CHỈ là kiểu: service chuyển tiếp cho repository (mẫu `modules/gamification/repositories/tx.ts`), giữ "service không import Prisma" mà vẫn
 * bảo đảm cập nhật ví + dòng sổ cái nằm trong MỘT transaction. Repo in-memory bỏ qua tay cầm (xem `tx.inmemory.ts` — bản test có hoàn tác thật).
 */
export type TxHandle = Prisma.TransactionClient;

export interface ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

/** `withTransaction`: timeout cố định + thử lại tối đa vài lần khi Mongo báo write-conflict/transient (hai giao dịch cùng đụng MỘT ví). */
export class PrismaTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return withTransaction(fn);
  }
}

/**
 * Vi phạm unique index do ĐUA GHI hoặc phát lại (P2002) — repository đổi thành lỗi miền này. ⚠️ Trong transaction Mongo, P2002 làm transaction đã HỎNG: KHÔNG bắt rồi chạy tiếp
 * trong cùng `tx.run`; để lỗi thoát callback (rollback) rồi bắt Ở NGOÀI (mẫu `modules/gamification/repositories/tx.ts`).
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
