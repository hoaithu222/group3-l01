import type { MarketplacePurchase, PurchaseCreateInput } from "../entities/coins.interface";
import type { TxHandle } from "./tx";

/** `MarketplacePurchase` (p7-02 be.md §5 "Listing buy/refund", P1) — unique `(listingId, buyerId)`: một người chỉ mua một tin MỘT lần. */
export interface IPurchaseRepository {
  find(id: string, tx?: TxHandle): Promise<MarketplacePurchase | null>;
  findByListingAndBuyer(listingId: string, buyerId: string, tx?: TxHandle): Promise<MarketplacePurchase | null>;
  /** Ném `UniqueViolationError("MarketplacePurchase")` khi trùng `(listingId, buyerId)` (mua lại/đua request). */
  create(data: PurchaseCreateInput, tx: TxHandle): Promise<MarketplacePurchase>;
  /** Ghi `accessRef` SAU khi `IContentAccessPort.grantAccess` xong (ngoài transaction mua — cấp quyền không nhất thiết nguyên tử với trừ xu). */
  setAccessRef(id: string, accessRef: string): Promise<void>;
  markRefunded(id: string, at: Date, tx: TxHandle): Promise<void>;
  /** Mua CHƯA hoàn, tạo tại/sau `since` (cửa sổ hoàn `refundWindowDays`) của một tin — job/khi ẩn tin duyệt qua từng dòng. */
  listByListingUnrefunded(listingId: string, since: Date): Promise<MarketplacePurchase[]>;
  listByBuyer(buyerId: string, opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplacePurchase[]>;
}
