/* eslint-disable @typescript-eslint/require-await -- bản in-memory cài đặt interface bất đồng bộ */
import { newObjectId } from "../../../core/utils/object-id";
import { evaluateSkillCriteria } from "../../../shared/criteria/skill-criteria";
import type { ProgressDelta, UserSkillBadge, UserSkillProgress, UserSkillTaskCredit } from "../entities/skill.interface";
import type { CreditValues, EligibleQuery, ISkillCreditRepository, IUserSkillProgressRepository, NewCredit } from "./skill-ledger.repository.interface";
import { UniqueViolationError } from "./tx";

/** Credit in-memory — unique `(userId, skillId, taskId)` và ghi có điều kiện như bản Prisma. */
export class InMemorySkillCreditRepository implements ISkillCreditRepository {
  readonly rows = new Map<string, UserSkillTaskCredit>();

  async findByKey(userId: string, skillId: string, taskId: string): Promise<UserSkillTaskCredit | null> {
    const c = [...this.rows.values()].find((r) => r.userId === userId && r.skillId === skillId && r.taskId === taskId);
    return c ? { ...c } : null;
  }

  async listByTask(taskId: string): Promise<UserSkillTaskCredit[]> {
    return [...this.rows.values()].filter((r) => r.taskId === taskId).map((r) => ({ ...r }));
  }

  async findByIds(ids: readonly string[]): Promise<UserSkillTaskCredit[]> {
    return [...this.rows.values()].filter((r) => ids.includes(r.id)).map((r) => ({ ...r }));
  }

  async create(input: NewCredit): Promise<UserSkillTaskCredit> {
    if (await this.findByKey(input.userId, input.skillId, input.taskId)) throw new UniqueViolationError(`credit:${input.taskId}`);
    const row = { ...input, id: newObjectId() };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async transition(id: string, expect: { status: UserSkillTaskCredit["status"]; completionCount: number }, values: Partial<CreditValues>): Promise<boolean> {
    const cur = this.rows.get(id);
    if (!cur || cur.status !== expect.status || cur.completionCount !== expect.completionCount) return false;
    this.rows.set(id, { ...cur, ...values });
    return true;
  }

  async listTop(userId: string, skillId: string, limit: number): Promise<UserSkillTaskCredit[]> {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId && r.skillId === skillId && r.status === "ACTIVE")
      .sort((a, b) => b.storyPointsX10 - a.storyPointsX10 || (b.reviewScoreX10 ?? -1) - (a.reviewScoreX10 ?? -1) || b.completedAt.getTime() - a.completedAt.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async aggregateActive(skillId: string): Promise<Array<Omit<UserSkillProgress, "skillId">>> {
    const by = new Map<string, Omit<UserSkillProgress, "skillId">>();
    for (const c of this.rows.values()) {
      if (c.skillId !== skillId || c.status !== "ACTIVE") continue;
      const cur = by.get(c.userId) ?? { userId: c.userId, tasksDone: 0, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0, lastTaskAt: null };
      cur.tasksDone += 1;
      cur.storyPointsX10 += c.storyPointsX10;
      cur.reviewScoreSumX10 += c.reviewScoreX10 ?? 0;
      cur.reviewScoreCount += c.reviewScoreX10 === null ? 0 : 1;
      cur.lastTaskAt = !cur.lastTaskAt || c.completedAt > cur.lastTaskAt ? c.completedAt : cur.lastTaskAt;
      by.set(c.userId, cur);
    }
    return [...by.values()];
  }

  async deleteByUser(userId: string): Promise<number> {
    const ids = [...this.rows.values()].filter((r) => r.userId === userId).map((r) => r.id);
    ids.forEach((id) => this.rows.delete(id));
    return ids.length;
  }
}

/** Tiến độ in-memory; `badges` (tuỳ chọn) để `previewEligible` đếm người đã giữ huy hiệu. */
export class InMemorySkillProgressRepository implements IUserSkillProgressRepository {
  readonly rows = new Map<string, UserSkillProgress>();
  constructor(private readonly badges?: { rows: Map<string, UserSkillBadge> }) {}

  private key = (userId: string, skillId: string) => `${userId}:${skillId}`;

  async ensure(userId: string, skillId: string): Promise<void> {
    const k = this.key(userId, skillId);
    if (!this.rows.has(k)) this.rows.set(k, { userId, skillId, tasksDone: 0, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0, lastTaskAt: null });
  }

  async increment(userId: string, skillId: string, d: ProgressDelta): Promise<void> {
    const cur = this.rows.get(this.key(userId, skillId));
    if (!cur) throw new Error("progress chưa ensure");
    cur.tasksDone += d.tasksDone;
    cur.storyPointsX10 += d.storyPointsX10;
    cur.reviewScoreSumX10 += d.reviewScoreSumX10;
    cur.reviewScoreCount += d.reviewScoreCount;
    if (d.lastTaskAt) cur.lastTaskAt = d.lastTaskAt;
  }

  async find(userId: string, skillId: string): Promise<UserSkillProgress | null> {
    const r = this.rows.get(this.key(userId, skillId));
    return r ? { ...r } : null;
  }

  async listByUser(userId: string): Promise<UserSkillProgress[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId).map((r) => ({ ...r }));
  }

  async overwrite(v: UserSkillProgress): Promise<boolean> {
    const cur = this.rows.get(this.key(v.userId, v.skillId));
    const same = cur && cur.tasksDone === v.tasksDone && cur.storyPointsX10 === v.storyPointsX10 && cur.reviewScoreSumX10 === v.reviewScoreSumX10 && cur.reviewScoreCount === v.reviewScoreCount;
    if (same) return false;
    this.rows.set(this.key(v.userId, v.skillId), { ...v });
    return true;
  }

  async zeroOthers(skillId: string, keep: readonly string[]): Promise<number> {
    let n = 0;
    for (const r of this.rows.values()) {
      if (r.skillId !== skillId || keep.includes(r.userId) || (r.tasksDone === 0 && r.storyPointsX10 === 0 && r.reviewScoreCount === 0)) continue;
      Object.assign(r, { tasksDone: 0, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0 });
      n += 1;
    }
    return n;
  }

  private eligible(q: EligibleQuery): UserSkillProgress[] {
    return [...this.rows.values()].filter((r) => r.skillId === q.skillId && evaluateSkillCriteria(q.criteria, r)).sort((a, b) => a.userId.localeCompare(b.userId));
  }

  async listEligiblePage(q: EligibleQuery, after: string | undefined, limit: number): Promise<string[]> {
    return this.eligible(q).filter((r) => !after || r.userId > after).slice(0, limit).map((r) => r.userId);
  }

  async previewEligible(q: EligibleQuery, sampleMax: number): Promise<{ eligibleCount: number; alreadyHolding: number; sampleUserIds: string[] }> {
    const list = this.eligible(q);
    const holders = new Set([...(this.badges?.rows.values() ?? [])].filter((b) => b.skillId === q.skillId).map((b) => b.userId));
    return { eligibleCount: list.length, alreadyHolding: list.filter((r) => holders.has(r.userId)).length, sampleUserIds: list.slice(0, sampleMax).map((r) => r.userId) };
  }

  async deleteByUser(userId: string): Promise<number> {
    const keys = [...this.rows.entries()].filter(([, r]) => r.userId === userId).map(([k]) => k);
    keys.forEach((k) => this.rows.delete(k));
    return keys.length;
  }
}
