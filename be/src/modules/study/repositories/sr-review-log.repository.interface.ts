import type { SrReviewLog, SrReviewLogCreateInput } from "../entities/sr.interface";
import type { TxHandle } from "./tx";

export interface ISrReviewLogRepository {
  findByClientId(userId: string, clientReviewId: string): Promise<SrReviewLog | null>;
  /** `(userId, clientReviewId)` trùng → ném `UniqueViolationError` (KHÔNG chạy tiếp trong tx — xem `errors.ts`). */
  create(row: SrReviewLogCreateInput, tx?: TxHandle): Promise<SrReviewLog>;
  /** Số lượt ôn của người trong ngày địa phương; `newOnly` = chỉ thẻ MỚI (`prevInterval = 0`), `setId` = riêng một bộ. */
  countByDate(userId: string, localDate: string, opts?: { newOnly?: boolean; setId?: string }): Promise<number>;
  /** Đã có lượt ôn của mục này trong ngày chưa (quyết định phát `sr.reviewed` — mỗi thẻ/ngày một sự kiện). */
  existsForItemDate(userId: string, itemId: string, localDate: string, tx?: TxHandle): Promise<boolean>;
  /** Các `localDate` (không trùng) có ôn, từ `sinceDate` (gồm) — tính chuỗi ngày ôn. */
  listLocalDates(userId: string, sinceDate: string): Promise<string[]>;
  deleteByUser(userId: string): Promise<number>;
}
