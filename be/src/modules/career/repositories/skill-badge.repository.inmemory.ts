/* eslint-disable @typescript-eslint/require-await -- bản in-memory cài đặt interface bất đồng bộ */
import { newObjectId } from "../../../core/utils/object-id";
import { DEFAULT_CAREER_VISIBILITY, type CareerVisibility, type UserCareer } from "../entities/career.interface";
import type { UserSkillBadge } from "../entities/skill.interface";
import type { ICareerProfileRepository } from "./career-profile.repository";
import type { ISkillBadgeRepository, NewSkillBadge } from "./skill-badge.repository.interface";
import { UniqueViolationError } from "./tx";

const copy = (b: UserSkillBadge): UserSkillBadge => ({ ...b, proof: { ...b.proof, taskCreditIds: [...b.proof.taskCreditIds] }, criteriaSnapshot: { ...b.criteriaSnapshot } });

export class InMemorySkillBadgeRepository implements ISkillBadgeRepository {
  readonly rows = new Map<string, UserSkillBadge>();
  private key = (userId: string, skillId: string) => `${userId}:${skillId}`;

  async find(userId: string, skillId: string): Promise<UserSkillBadge | null> {
    const b = this.rows.get(this.key(userId, skillId));
    return b ? copy(b) : null;
  }

  async listByUser(userId: string, includeRevoked: boolean): Promise<UserSkillBadge[]> {
    return [...this.rows.values()]
      .filter((b) => b.userId === userId && (includeRevoked || !b.revokedAt))
      .sort((a, b) => b.unlockedAt.getTime() - a.unlockedAt.getTime())
      .map(copy);
  }

  async create(input: NewSkillBadge): Promise<UserSkillBadge> {
    const k = this.key(input.userId, input.skillId);
    if (this.rows.has(k)) throw new UniqueViolationError(`UserSkillBadge:${k}`);
    const row: UserSkillBadge = { ...input, id: newObjectId(), revokedAt: null, revokedBy: null, revokedReason: null };
    this.rows.set(k, row);
    return copy(row);
  }

  async revoke(userId: string, skillId: string, by: string, reason: string, at: Date): Promise<UserSkillBadge | null> {
    const b = this.rows.get(this.key(userId, skillId));
    if (!b || b.revokedAt) return null;
    Object.assign(b, { revokedAt: at, revokedBy: by, revokedReason: reason });
    return copy(b);
  }

  async restore(userId: string, skillId: string): Promise<UserSkillBadge | null> {
    const b = this.rows.get(this.key(userId, skillId));
    if (!b || !b.revokedAt) return null;
    Object.assign(b, { revokedAt: null, revokedBy: null, revokedReason: null });
    return copy(b);
  }

  async holdersCount(skillIds: readonly string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const b of this.rows.values()) if (skillIds.includes(b.skillId) && !b.revokedAt) out.set(b.skillId, (out.get(b.skillId) ?? 0) + 1);
    return out;
  }

  async deleteByUser(userId: string): Promise<number> {
    const keys = [...this.rows.entries()].filter(([, b]) => b.userId === userId).map(([k]) => k);
    keys.forEach((k) => this.rows.delete(k));
    return keys.length;
  }
}

export class InMemoryCareerProfileRepository implements ICareerProfileRepository {
  readonly rows = new Map<string, UserCareer>();

  async find(userId: string): Promise<UserCareer | null> {
    const r = this.rows.get(userId);
    return r ? { ...r, visibility: { ...r.visibility } } : null;
  }

  async findMany(userIds: readonly string[]): Promise<Map<string, UserCareer>> {
    return new Map([...this.rows.entries()].filter(([id]) => userIds.includes(id)));
  }

  async upsertVisibility(userId: string, visibility: CareerVisibility): Promise<UserCareer> {
    const cur = this.rows.get(userId);
    const next: UserCareer = cur
      ? { ...cur, visibility: { ...visibility }, updatedAt: new Date() }
      : { userId, openToWork: false, openToWorkChangedAt: null, headline: null, preferredRoles: [], location: null, consentVersion: null, visibility: { ...DEFAULT_CAREER_VISIBILITY, ...visibility }, updatedAt: new Date() };
    this.rows.set(userId, next);
    return { ...next };
  }

  async deleteByUser(userId: string): Promise<number> {
    return this.rows.delete(userId) ? 1 : 0;
  }
}
