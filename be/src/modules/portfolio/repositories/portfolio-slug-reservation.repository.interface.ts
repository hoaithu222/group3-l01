import type { SlugReservation } from "../entities/portfolio.interface";
import type { TxHandle } from "./tx";

export interface ReservationInput {
  slugKey: string;
  portfolioId: string;
  redirectTo: string | null;
  expiresAt: Date;
}

/** Kho `PortfolioSlugReservation` (unique `slugKey`): slug cũ giữ `slugReserveDays` ngày để 301 sang slug mới hoặc chặn người khác chiếm. */
export interface IPortfolioSlugReservationRepository {
  /** Trả cả bản ghi đã hết hạn — caller so `expiresAt` với đồng hồ của mình. */
  findByKey(slugKey: string, tx?: TxHandle): Promise<SlugReservation | null>;
  /** Ghi đè bản ghi cùng `slugKey` (của chính hồ sơ này hoặc đã hết hạn) hoặc tạo mới; ném `UniqueViolationError` khi đua tạo cùng khoá. */
  upsert(input: ReservationInput, tx?: TxHandle): Promise<SlugReservation>;
  /** Trỏ MỌI reservation chưa hết hạn của hồ sơ (có `redirectTo` khác null) sang slug mới / `null` — tránh chuỗi chuyển hướng A→B→C. */
  redirectAll(portfolioId: string, redirectTo: string | null, tx?: TxHandle): Promise<number>;
  deleteByKey(slugKey: string, tx?: TxHandle): Promise<boolean>;
  /** Xoá bản ghi hết hạn (tối đa `limit`); trả các `slugKey` đã xoá (để xoá cache Redis). */
  deleteExpired(now: Date, limit: number): Promise<string[]>;
}
