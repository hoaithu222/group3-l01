/**
 * Cổng giao dịch cho `projects`: service KHÔNG import Prisma (api-patterns.md) nên nhận/giữ `TxContext` mờ.
 * Bản Prisma bọc `withTransaction` (retry lỗi transient); bản in-memory (test) chỉ chạy `fn` thẳng.
 * Repository Prisma đổi ngược `TxContext` → `Prisma.TransactionClient` bằng `prismaTx()` (prisma-tx.ts).
 */
export interface TxContext {
  readonly __projectsTx: true;
}

export interface IProjectsUnitOfWork {
  /** `fn` có thể bị chạy lại khi lỗi transient ⇒ không được có tác dụng phụ ngoài DB (emit/enqueue làm SAU commit). */
  run<T>(fn: (tx: TxContext) => Promise<T>): Promise<T>;
}
