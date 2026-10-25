import { LIMITS } from "../../../core/constants/limits";
import { avgPeerScoreX10, evaluateSkillCriteria } from "../../../shared/criteria/skill-criteria";
import { DOMAIN_EVENTS } from "../../../shared/events/domain-events";
import type { SkillDefinition, SkillProof } from "../entities/skill.interface";
import { CAREER_NOTIFICATION_TYPES } from "../notifications/career.notification-types";
import type { ISkillBadgeRepository } from "../repositories/skill-badge.repository.interface";
import type { ISkillCreditRepository, IUserSkillProgressRepository } from "../repositories/skill-ledger.repository.interface";
import { UniqueViolationError, type ICareerNotifier, type ICareerOutbox, type ITxRunner } from "../repositories/tx";
import { skillEventRow } from "./skill-events";

export interface SkillEvaluationDeps {
  progress: IUserSkillProgressRepository;
  credits: ISkillCreditRepository;
  badges: ISkillBadgeRepository;
  tx: ITxRunner;
  notifier: ICareerNotifier;
  outbox: ICareerOutbox;
  now?: () => Date;
}

/**
 * Đánh giá + cấp huy hiệu kỹ năng (p6-06 be.md §5 "evaluate"). CHỈ backend cấp (không có endpoint — CR-03). Mỗi (người, kỹ năng) cấp đúng MỘT lần:
 * `UserSkillBadge` unique; huy hiệu đã thu hồi KHÔNG tự cấp lại dù đủ tiêu chí (CR-25 — vận hành phải "Khôi phục"); đổi tiêu chí không thu hồi
 * huy hiệu đã cấp (CR-24 — `criteriaSnapshot` giữ tiêu chí lúc cấp). Cấp = MỘT transaction: huy hiệu + minh chứng + thông báo + outbox `skill.unlocked`.
 */
export class SkillEvaluationService {
  constructor(private readonly d: SkillEvaluationDeps) {}

  /** `true` khi vừa cấp mới. Kỹ năng tắt / đã có huy hiệu / chưa đủ tiêu chí → `false`. */
  async evaluate(userId: string, skill: SkillDefinition): Promise<boolean> {
    if (!skill.isActive) return false;
    if (await this.d.badges.find(userId, skill.id)) return false;
    const progress = await this.d.progress.find(userId, skill.id);
    if (!progress || !evaluateSkillCriteria(skill.criteria, progress)) return false;

    const top = await this.d.credits.listTop(userId, skill.id, LIMITS.skill.proofTasksMax);
    const proof: SkillProof = {
      taskCreditIds: top.map((c) => c.id),
      tasksDone: progress.tasksDone,
      storyPointsX10: progress.storyPointsX10,
      avgPeerScoreX10: avgPeerScoreX10(progress),
    };
    const now = this.d.now?.() ?? new Date();
    try {
      await this.d.tx.run(async (tx) => {
        await this.d.badges.create({ userId, skillId: skill.id, unlockedAt: now, proof, criteriaSnapshot: { ...skill.criteria } }, tx);
        const key = `skill-unlocked:${userId}:${skill.id}`;
        await this.d.notifier.notify(tx, {
          type: CAREER_NOTIFICATION_TYPES.SKILL_UNLOCKED,
          scope: null,
          source: { type: "UserSkillBadge", id: key },
          refs: { skillId: skill.id, code: skill.code, name: skill.name, icon: skill.icon },
          recipients: [{ userId }],
          dedupeKey: key,
        });
        await this.d.outbox.add(tx, skillEventRow(DOMAIN_EVENTS.SKILL_UNLOCKED, userId, skill, now));
      });
    } catch (err) {
      // Job khác vừa cấp cùng (người, kỹ năng) — P2002 đã rollback cả tx (không thông báo trùng).
      if (err instanceof UniqueViolationError) return false;
      throw err;
    }
    return true;
  }
}
