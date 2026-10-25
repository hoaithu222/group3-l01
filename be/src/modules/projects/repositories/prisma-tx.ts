import type { Prisma } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import type { IProjectsUnitOfWork, TxContext } from "./unit-of-work";

/** Chỉ dùng trong repository/outbox Prisma và effect/policy của p4 cần ghi cùng transaction với `move`. */
export function prismaTx(tx: TxContext): Prisma.TransactionClient {
  return tx as unknown as Prisma.TransactionClient;
}

/** Client dùng cho một thao tác: `tx` nếu đang trong giao dịch, ngược lại client toàn cục. */
export function db(tx?: TxContext): Prisma.TransactionClient {
  return tx ? prismaTx(tx) : prisma;
}

export class PrismaProjectsUnitOfWork implements IProjectsUnitOfWork {
  run<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
    return withTransaction((tx) => fn(tx as unknown as TxContext));
  }
}
