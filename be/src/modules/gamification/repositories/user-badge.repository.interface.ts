import type { UserBadge } from "../entities/gamification.interface";
import type { TxHandle } from "./tx";

export interface IUserBadgeRepository {
  /** Mọi bản ghi của người (kể cả đã thu hồi — huy hiệu thu hồi KHÔNG tự mở lại). */
  listByUser(userId: string, tx?: TxHandle): Promise<UserBadge[]>;
  /** `(userId, badgeId)` trùng → ném `UniqueViolationError` (trong tx: để lỗi thoát callback, xem `tx.ts`). */
  create(row: { userId: string; badgeId: string; via: "EVENT" | "BACKFILL" }, tx?: TxHandle): Promise<UserBadge>;
  /** Tạo NGOÀI transaction (backfill); đã có → `false`. */
  insertIfMissing(row: { userId: string; badgeId: string; via: "EVENT" | "BACKFILL" }): Promise<boolean>;
  /** Số người đang giữ (chưa thu hồi) mỗi huy hiệu. */
  countByBadges(badgeIds: readonly string[]): Promise<Map<string, number>>;
  markSeen(userId: string, badgeIds: readonly string[], at: Date): Promise<void>;
  /** Thu hồi (đánh dấu, không xoá) — `false` nếu người này chưa có/đã thu hồi. */
  revoke(userId: string, badgeId: string, actorId: string, reason: string, at: Date): Promise<boolean>;
  deleteByUser(userId: string): Promise<number>;
}
