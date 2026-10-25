import type { UserSkillBadge } from "../entities/skill.interface";
import type { TxHandle } from "./tx";

export type NewSkillBadge = Pick<UserSkillBadge, "userId" | "skillId" | "unlockedAt" | "proof" | "criteriaSnapshot">;

export interface ISkillBadgeRepository {
  find(userId: string, skillId: string, tx?: TxHandle): Promise<UserSkillBadge | null>;
  /** Huy hiệu của một người; `includeRevoked=false` chỉ lấy huy hiệu còn hiệu lực. Mới → cũ. */
  listByUser(userId: string, includeRevoked: boolean): Promise<UserSkillBadge[]>;
  /** `(userId, skillId)` đã có (kể cả đã thu hồi) → `UniqueViolationError` — huy hiệu cấp đúng MỘT lần. */
  create(input: NewSkillBadge, tx?: TxHandle): Promise<UserSkillBadge>;
  /** CAS: chỉ khi CHƯA thu hồi. `null` = không có/đã thu hồi. */
  revoke(userId: string, skillId: string, by: string, reason: string, at: Date, tx?: TxHandle): Promise<UserSkillBadge | null>;
  /** CAS: chỉ khi ĐANG bị thu hồi. */
  restore(userId: string, skillId: string, tx?: TxHandle): Promise<UserSkillBadge | null>;
  /** Số người đang giữ (chưa thu hồi) theo kỹ năng. */
  holdersCount(skillIds: readonly string[]): Promise<Map<string, number>>;
  deleteByUser(userId: string): Promise<number>;
}
