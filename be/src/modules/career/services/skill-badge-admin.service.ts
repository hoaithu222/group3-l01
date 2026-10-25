import { ConflictError, NotFoundError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { toSafeJobId } from "../../../infrastructure/queue";
import { toDisplayCriteria, type DisplaySkillCriteria } from "../../../shared/criteria/skill-criteria";
import { DOMAIN_EVENTS, eventKeys } from "../../../shared/events/domain-events";
import type { SkillDefinition, UserSkillBadge } from "../entities/skill.interface";
import { CAREER_NOTIFICATION_TYPES } from "../notifications/career.notification-types";
import type { ISkillBadgeRepository } from "../repositories/skill-badge.repository.interface";
import type { ISkillDefinitionRepository } from "../repositories/skill-definition.repository.interface";
import type { IUserSkillProgressRepository } from "../repositories/skill-ledger.repository.interface";
import type { ISkillSourceRepository } from "../repositories/skill-source.repository";
import type { ICareerNotifier, ICareerOutbox, ITxRunner } from "../repositories/tx";
import type { ICareerAudit, IReevaluateGate } from "./career.ports";
import { presentProgress, presentSummary, type SkillProgressDto, type SkillSummaryDto } from "./skill.presenter";
import { noBadge, notRevoked, reevaluateTooSoon } from "./skill-errors";
import { skillEventRow } from "./skill-events";
import { reevaluateAllRow } from "./skill-reevaluate.rows";

export interface AdminBadgeDto {
  unlockedAt: string;
  revokedAt: string | null;
  revokedBy: { id: string; name: string } | null;
  revokedReason: string | null;
}

export interface AdminUserSkillRow {
  skill: SkillSummaryDto & { isActive: boolean; criteria: DisplaySkillCriteria };
  progress: SkillProgressDto;
  badge: AdminBadgeDto | null;
}

export interface SkillBadgeAdminDeps {
  definitions: ISkillDefinitionRepository;
  progress: IUserSkillProgressRepository;
  badges: ISkillBadgeRepository;
  source: ISkillSourceRepository;
  tx: ITxRunner;
  notifier: ICareerNotifier;
  outbox: ICareerOutbox;
  audit: ICareerAudit;
  gate: IReevaluateGate;
  now?: () => Date;
}

/**
 * Vận hành huy hiệu của một người (admin.md §2.3): xem tiến độ + huy hiệu, THU HỒI (lý do ≥ 10 ký tự, thông báo người dùng, không tự cấp lại — CR-25),
 * KHÔI PHỤC, và "Đánh giá lại toàn bộ" (limiter 1 lần/giờ — `SKILL_006`). Không có thao tác CẤP tay (CR-03).
 */
export class SkillBadgeAdminService {
  constructor(private readonly d: SkillBadgeAdminDeps) {}

  private now = () => this.d.now?.() ?? new Date();

  async userSkills(userId: string): Promise<AdminUserSkillRow[]> {
    const user = (await this.d.source.users([userId])).get(userId);
    if (!user) throw new NotFoundError("Không tìm thấy người dùng");
    const [active, progress, badges] = await Promise.all([this.d.definitions.listActive(), this.d.progress.listByUser(userId), this.d.badges.listByUser(userId, true)]);
    const extraIds = badges.map((b) => b.skillId).filter((id) => !active.some((s) => s.id === id));
    const skills = [...active, ...(await this.d.definitions.findByIds(extraIds))];
    const pBy = new Map(progress.map((p) => [p.skillId, p]));
    const bBy = new Map(badges.map((b) => [b.skillId, b]));
    const revokers = await this.d.source.users(badges.flatMap((b) => (b.revokedBy ? [b.revokedBy] : [])));
    return skills.map((s) => ({
      skill: { ...presentSummary(s), isActive: s.isActive, criteria: toDisplayCriteria(s.criteria) },
      progress: presentProgress(s, pBy.get(s.id) ?? null),
      badge: this.presentBadge(bBy.get(s.id), revokers),
    }));
  }

  async revoke(actor: AuthUser, userId: string, skillId: string, reason: string): Promise<AdminBadgeDto> {
    const [skill, cur] = await Promise.all([this.requireSkill(skillId), this.d.badges.find(userId, skillId)]);
    if (!cur) throw noBadge();
    if (cur.revokedAt) throw new ConflictError("Huy hiệu đã bị thu hồi");
    const at = this.now();
    const badge = await this.d.tx.run(async (tx) => {
      const saved = await this.d.badges.revoke(userId, skillId, actor.id, reason, at, tx);
      if (!saved) return null;
      const key = `skill-revoked:${userId}:${skillId}:${at.getTime()}`;
      await this.d.notifier.notify(tx, {
        type: CAREER_NOTIFICATION_TYPES.SKILL_REVOKED,
        scope: null,
        source: { type: "UserSkillBadge", id: key },
        refs: { skillId: skill.id, code: skill.code, name: skill.name, icon: skill.icon },
        recipients: [{ userId }],
        dedupeKey: key,
      });
      await this.d.outbox.add(tx, skillEventRow(DOMAIN_EVENTS.SKILL_REVOKED, userId, skill, at));
      return saved;
    });
    if (!badge) throw new ConflictError("Huy hiệu đã bị thu hồi");
    await this.audit(actor, "skill.revoke", badge, skill, reason);
    return this.presentBadge(badge, new Map([[actor.id, { id: actor.id, name: actor.name ?? "" }]])) as AdminBadgeDto;
  }

  async restore(actor: AuthUser, userId: string, skillId: string, reason: string): Promise<AdminBadgeDto> {
    const [skill, cur] = await Promise.all([this.requireSkill(skillId), this.d.badges.find(userId, skillId)]);
    if (!cur) throw noBadge();
    if (!cur.revokedAt) throw notRevoked();
    const badge = await this.d.tx.run(async (tx) => {
      const saved = await this.d.badges.restore(userId, skillId, tx);
      if (saved) await this.d.outbox.add(tx, skillEventRow(DOMAIN_EVENTS.SKILL_RESTORED, userId, skill, this.now()));
      return saved;
    });
    if (!badge) throw notRevoked();
    await this.audit(actor, "skill.restore", badge, skill, reason);
    return this.presentBadge(badge, new Map()) as AdminBadgeDto;
  }

  /** "Đánh giá lại toàn bộ" — đánh giá lại MỌI kỹ năng đang bật cho người đủ mà chưa có huy hiệu (job nền, outbox). */
  async reevaluateAll(actor: AuthUser, reason: string): Promise<{ jobId: string; skills: number }> {
    const cooldown = LIMITS.skill.reevaluateCooldownSeconds;
    if (!(await this.d.gate.tryAcquire(cooldown))) throw reevaluateTooSoon(cooldown);
    const bucket = Math.floor(this.now().getTime() / (cooldown * 1000));
    const skills = (await this.d.definitions.listActive()).length;
    await this.d.tx.run((tx) => this.d.outbox.add(tx, reevaluateAllRow(bucket, actor.id)));
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "skill.reevaluate", targetType: "SkillDefinition", targetId: actor.id, reason, metadata: { skills } });
    return { jobId: toSafeJobId(eventKeys.skillReevaluateAll(bucket)), skills };
  }

  private async requireSkill(id: string): Promise<SkillDefinition> {
    const s = await this.d.definitions.findById(id);
    if (!s) throw new NotFoundError("Không tìm thấy kỹ năng");
    return s;
  }

  private presentBadge(b: UserSkillBadge | undefined, users: Map<string, { id: string; name: string }>): AdminBadgeDto | null {
    if (!b) return null;
    const by = b.revokedBy ? users.get(b.revokedBy) : undefined;
    return {
      unlockedAt: b.unlockedAt.toISOString(),
      revokedAt: b.revokedAt ? b.revokedAt.toISOString() : null,
      revokedBy: b.revokedBy ? { id: b.revokedBy, name: by?.name ?? "" } : null,
      revokedReason: b.revokedReason,
    };
  }

  private audit(actor: AuthUser, action: "skill.revoke" | "skill.restore", badge: UserSkillBadge, skill: SkillDefinition, reason: string): Promise<void> {
    return this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action, targetType: "UserSkillBadge", targetId: badge.id, reason, metadata: { userId: badge.userId, skillId: skill.id, code: skill.code } });
  }
}
