import type { Criteria } from "../../../shared/criteria/criteria-evaluator";
import type { UserGamification, UserGamificationPatch } from "../entities/gamification.interface";
import type { TxHandle } from "./tx";

export interface IUserGamificationRepository {
  find(userId: string, tx?: TxHandle): Promise<UserGamification | null>;
  findMany(userIds: readonly string[]): Promise<UserGamification[]>;
  /** Tạo hàng khởi đầu NGOÀI transaction nếu chưa có (hai tx cùng tạo khoá unique MỚI ⇒ P2002 không retry). Đua tạo → bỏ qua. */
  ensure(userId: string): Promise<void>;
  /** CAS `version` (+1) — `null` = lệch phiên bản. */
  updateIf(userId: string, expectedVersion: number, patch: UserGamificationPatch, tx?: TxHandle): Promise<UserGamification | null>;
  /** Số người thoả criteria (xem trước huy hiệu mới). */
  countMatching(criteria: Criteria): Promise<number>;
  /** Trang người thoả criteria theo `userId` tăng dần, sau `afterUserId` (backfill huy hiệu). */
  listMatchingPage(criteria: Criteria, opts: { afterUserId?: string; limit: number }): Promise<UserGamification[]>;
  /** Các múi giờ đang có người còn chuỗi (`streak > 0`). */
  listStreakTimezones(): Promise<string[]>;
  /** Đặt `streak = 0` cho người ở múi giờ `tz` mà `lastActiveDate < beforeDate` — trả danh sách người đã đổi. */
  resetStaleStreaks(tz: string, beforeDate: string): Promise<string[]>;
  deleteByUser(userId: string): Promise<number>;
}
