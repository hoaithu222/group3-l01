import type { CoinEarnEvent, CoinEarnEventInsert } from "../entities/coins.interface";
import type { TxHandle } from "./tx";

/**
 * Nhật ký xử lý `xp.awarded`: mỏ neo idempotent (unique `dedupeKey`) VÀ nguồn của trần ngày. Ghi trong CÙNG transaction với dòng sổ cái/tiến độ nhiệm vụ nên "đã thưởng hôm nay" luôn
 * khớp thứ đã thật sự được ghi (khác bộ đếm Redis tăng trước rồi mới ghi — lệch khi retry).
 */
export interface ICoinEarnEventRepository {
  /** Đường nhanh (ngoài transaction) — bỏ qua sự kiện đã xử lý mà không mở transaction. */
  exists(dedupeKey: string): Promise<boolean>;
  /** Ném `UniqueViolationError("CoinEarnEvent.dedupeKey")` khi trùng — caller để lỗi thoát transaction rồi coi là DUPLICATE. */
  create(input: CoinEarnEventInsert, tx: TxHandle): Promise<CoinEarnEvent>;
  /** Σ `coins` đã thưởng trong `localDate` của người này, tuỳ chọn chỉ theo một `sourceType`. */
  sumCoins(userId: string, localDate: string, sourceType: string | null, tx?: TxHandle): Promise<number>;
  /** Σ xu đã thưởng theo nguồn từ `fromLocalDate` (gồm cả ngày đó) — cột "Phát 7 ngày" của bảng luật xu. */
  sumBySourceSince(fromLocalDate: string): Promise<Map<string, number>>;
}
