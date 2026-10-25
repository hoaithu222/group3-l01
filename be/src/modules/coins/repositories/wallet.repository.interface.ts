import type { WalletDelta } from "../domain/coin-math";
import type { CoinWallet } from "../entities/coins.interface";
import type { TxHandle } from "./tx";

/** Kết quả `applyDelta`: thành công kèm ví SAU khi cập nhật, hoặc lý do bị điều kiện CAS chặn (ví KHÔNG đổi). */
export type ApplyDeltaResult = { ok: true; wallet: CoinWallet } | { ok: false; reason: "INSUFFICIENT" | "OVER_LIMIT" | "MISSING" };

export interface ICoinWalletRepository {
  /** Tạo ví (số dư 0) nếu chưa có — gọi NGOÀI transaction (hai giao dịch cùng tạo ⇒ P2002 không retry); nuốt đua unique. */
  ensure(userId: string): Promise<void>;
  find(userId: string, tx?: TxHandle): Promise<CoinWallet | null>;
  /**
   * CAS: chỉ cập nhật khi `balance` sau thay đổi nằm trong `[0, maxBalance]`, điều kiện và `$inc` chung MỘT thao tác nguyên tử trên một document — hai yêu cầu song song tiêu quá số dư
   * thì đúng một cái thắng. KHÔNG có đường nào khác ghi `balance`.
   */
  applyDelta(userId: string, delta: WalletDelta, maxBalance: number, tx: TxHandle): Promise<ApplyDeltaResult>;
  /** Trang ví theo `userId` tăng dần (job đối soát). */
  listPage(opts: { afterUserId?: string; limit: number }): Promise<CoinWallet[]>;
  /** Σ `balance` mọi ví — số xu đang lưu hành (tổng quan admin). */
  totalBalance(): Promise<number>;
}
