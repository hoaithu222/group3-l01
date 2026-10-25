import type { WellbeingDailyEntity, WellbeingDailyInput } from "../entities/burnout.interface";
import type { TxHandle } from "./tx";

export interface IWellbeingDailyRepository {
  findByDate(userId: string, date: string): Promise<WellbeingDailyEntity | null>;

  /** Ghi đè theo `(userId, date)` — job chạy lại cho ra đúng cùng một hàng (idempotent). */
  upsert(input: WellbeingDailyInput): Promise<WellbeingDailyEntity>;

  /** Các ngày có `date ≥ fromDate`, cũ → mới. */
  listSince(userId: string, fromDate: string): Promise<WellbeingDailyEntity[]>;

  deleteByUser(userId: string, tx?: TxHandle): Promise<number>;

  /** Dọn theo hạn lưu giữ (`createdAt < cutoff`). */
  deleteCreatedBefore(cutoff: Date): Promise<number>;
}
