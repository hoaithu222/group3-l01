import type { XpEvent, XpEventCreateInput, XpSourceTypeValue } from "../entities/gamification.interface";
import type { TxHandle } from "./tx";

export interface XpRankRow {
  userId: string;
  xp: number;
}

export interface IXpEventRepository {
  /** Đường nhanh: đã ghi nhận thực thể nguồn này cho người này chưa. */
  exists(dedupeKey: string): Promise<boolean>;
  /** `dedupeKey` trùng → ném `UniqueViolationError`. PHẢI là câu lệnh GHI đầu tiên của transaction (xem `tx.ts`). */
  create(input: XpEventCreateInput, tx: TxHandle): Promise<XpEvent>;
  /** Lịch sử của một người, mới → cũ theo `(createdAt, id)`. */
  listByUser(userId: string, opts: { after?: { at: Date; id: string }; limit: number }): Promise<XpEvent[]>;
  /** Tổng XP đã cộng trong ngày địa phương cho một nguồn (đếm trần ngày) — 0 nếu chưa có. */
  getDailyTotal(userId: string, sourceType: XpSourceTypeValue, localDate: string, tx: TxHandle): Promise<number>;
  /** Tạo hàng tổng (xp 0) NGOÀI transaction — hai tx cùng tạo khoá unique MỚI ⇒ P2002 không retry. Đã có → bỏ qua. */
  ensureDailyTotal(userId: string, sourceType: XpSourceTypeValue, localDate: string): Promise<void>;
  incDailyTotal(userId: string, sourceType: XpSourceTypeValue, localDate: string, by: number, tx: TxHandle): Promise<void>;
  /** Ẩn danh hoá: xoá tổng theo ngày của người dùng (`XpEvent` GIỮ — số liệu tổng/xếp hạng không đổi, người đã ẩn danh bị lọc khỏi bảng). */
  deleteDailyTotalsByUser(userId: string): Promise<number>;
  /** Xếp hạng XP theo workspace trong `[from, to)` (null = không chặn), giảm dần, ≤ `limit` — chỉ tính XP > 0. */
  rankByWorkspace(workspaceId: string, from: Date | null, to: Date | null, limit: number): Promise<XpRankRow[]>;
}
