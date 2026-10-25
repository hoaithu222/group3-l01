import type { StoredSkillCriteria } from "../../../shared/criteria/skill-criteria";
import type { ProgressDelta, SkillCreditStatus, UserSkillProgress, UserSkillTaskCredit } from "../entities/skill.interface";
import type { TxHandle } from "./tx";

/**
 * Sổ cái kỹ năng: `UserSkillTaskCredit` (từng task đã tính — khoá idempotent) + `UserSkillProgress` (tổng cộng dồn). Hai bảng đổi CÙNG transaction
 * trong `SkillProgressService`; cron đối soát dựng lại tổng từ credit ACTIVE khi lệch.
 */
export type NewCredit = Omit<UserSkillTaskCredit, "id">;
export type CreditValues = Pick<UserSkillTaskCredit, "storyPointsX10" | "reviewScoreX10" | "completedAt" | "completionCount" | "workspaceId" | "status">;

export interface ISkillCreditRepository {
  findByKey(userId: string, skillId: string, taskId: string, tx?: TxHandle): Promise<UserSkillTaskCredit | null>;
  listByTask(taskId: string): Promise<UserSkillTaskCredit[]>;
  findByIds(ids: readonly string[]): Promise<UserSkillTaskCredit[]>;
  /** Trùng `(userId, skillId, taskId)` → `UniqueViolationError`. */
  create(input: NewCredit, tx?: TxHandle): Promise<UserSkillTaskCredit>;
  /** Ghi CÓ ĐIỀU KIỆN (`status` + `completionCount` đang lưu khớp `expect`) — `false` khi đã bị job khác đổi trước. */
  transition(id: string, expect: { status: SkillCreditStatus; completionCount: number }, values: Partial<CreditValues>, tx?: TxHandle): Promise<boolean>;
  /** Top credit ACTIVE theo `storyPointsX10 desc, reviewScoreX10 desc, completedAt desc` (minh chứng). */
  listTop(userId: string, skillId: string, limit: number): Promise<UserSkillTaskCredit[]>;
  /** Tổng các credit ACTIVE của MỘT kỹ năng theo người (đối soát). */
  aggregateActive(skillId: string): Promise<Array<Omit<UserSkillProgress, "skillId">>>;
  deleteByUser(userId: string): Promise<number>;
}

export interface EligibleQuery {
  skillId: string;
  criteria: StoredSkillCriteria;
}

export interface IUserSkillProgressRepository {
  /** Tạo hàng 0 nếu chưa có — gọi NGOÀI transaction (hai tx cùng upsert khoá MỚI → P2002 không tự retry). */
  ensure(userId: string, skillId: string): Promise<void>;
  increment(userId: string, skillId: string, delta: ProgressDelta, tx?: TxHandle): Promise<void>;
  find(userId: string, skillId: string): Promise<UserSkillProgress | null>;
  listByUser(userId: string): Promise<UserSkillProgress[]>;
  /** Ghi đè tổng (đối soát); trả `true` khi giá trị thực sự đổi. */
  overwrite(values: UserSkillProgress): Promise<boolean>;
  /** Người có hàng tiến độ của kỹ năng nhưng không còn credit ACTIVE nào → đặt 0 (đối soát). */
  zeroOthers(skillId: string, keepUserIds: readonly string[]): Promise<number>;
  /** Trang userId đủ tiêu chí (đếm trên bảng tiến độ, không quét task) — đánh giá lại/backfill. */
  listEligiblePage(q: EligibleQuery, afterUserId: string | undefined, limit: number): Promise<string[]>;
  /** Xem trước (CR-27): số người đủ + số đã có huy hiệu (KỂ CẢ đã thu hồi — không được cấp lại) + ≤ `sampleMax` userId. */
  previewEligible(q: EligibleQuery, sampleMax: number): Promise<{ eligibleCount: number; alreadyHolding: number; sampleUserIds: string[] }>;
  deleteByUser(userId: string): Promise<number>;
}
