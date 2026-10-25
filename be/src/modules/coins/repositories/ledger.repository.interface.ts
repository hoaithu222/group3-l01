import type { CoinLedgerKey, CoinTransaction, CoinTransactionInsert, CoinTxTypeValue } from "../entities/coins.interface";
import type { TxHandle } from "./tx";

export interface LedgerTypeTotal {
  /** Σ `amount` có dấu của loại này trong khoảng. */
  sum: number;
  count: number;
}

/**
 * Sổ cái APPEND-ONLY: KHÔNG có `update`/`delete` — sửa sai bằng dòng bù (ADJUST_ADMIN/REFUND), không sửa dòng cũ. Đây là NGUỒN SỰ THẬT; `CoinWallet.balance` chỉ là cache của Σ `amount`.
 */
export interface ICoinLedgerRepository {
  findByKey(key: CoinLedgerKey, tx?: TxHandle): Promise<CoinTransaction | null>;
  /** Ném `UniqueViolationError("CoinTransaction")` khi trùng `(type, refType, refId, userId)` — caller để lỗi thoát transaction (rollback cả cập nhật ví) rồi trả kết quả cũ. */
  insert(input: CoinTransactionInsert, tx: TxHandle): Promise<CoinTransaction>;
  /** Mới → cũ theo `(at, id)`; `after` = mốc cursor (loại trừ); caller truyền `limit + 1` để biết còn trang sau. */
  listByUser(userId: string, opts: { type?: CoinTxTypeValue; after?: { at: Date; id: string }; limit: number }): Promise<CoinTransaction[]>;
  /** Σ `amount` theo người (đối soát với `CoinWallet.balance`); người không có dòng nào không xuất hiện trong map (= 0). */
  sumByUsers(userIds: readonly string[]): Promise<Map<string, number>>;
  /** Tổng theo loại trong `[from, to)` (tổng quan admin). */
  totalsByType(from: Date, to: Date): Promise<Map<CoinTxTypeValue, LedgerTypeTotal>>;
}
