import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";

/**
 * Tay cầm transaction — CHỈ là kiểu (`Prisma.TransactionClient`); service không gọi được gì trên nó, chỉ chuyển tiếp cho
 * repository/`IStudyAssetPort`. Repo in-memory bỏ qua. Cùng mẫu `modules/resources/repositories/tx.ts`: "service không
 * import Prisma" mà vẫn có transaction NGUYÊN TỬ giữa nhiều collection (bộ + mục + AssetLink).
 *
 * Chưa có `IOutboxPort`: p4-01 không phát sự kiện miền (`study-set.published` của p4-03 là tuỳ chọn; `sr.item-deleted` của
 * p4-02 chỉ thêm khi processor có mặt — worker ném lỗi cho job không có processor). p4-02 thêm cổng outbox cùng file này.
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

/** Test: chạy `fn` ngay với tay cầm giả (KHÔNG rollback — kiểm rollback ở test tích hợp trên Mongo thật). */
export class InMemoryTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return fn({} as unknown as TxHandle);
  }
}
