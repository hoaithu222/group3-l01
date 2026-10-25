import { LIMITS } from "../../../core/constants/limits";
import type { SkillDefinition } from "../entities/skill.interface";
import type { ISkillDefinitionRepository } from "../repositories/skill-definition.repository.interface";
import type { ISkillCreditRepository, IUserSkillProgressRepository } from "../repositories/skill-ledger.repository.interface";
import type { ISkillConfigPort } from "./career.ports";
import type { SkillEvaluationService } from "./skill-evaluation.service";

export interface SkillReconcileDeps {
  definitions: ISkillDefinitionRepository;
  credits: ISkillCreditRepository;
  progress: IUserSkillProgressRepository;
  evaluation: SkillEvaluationService;
  config: ISkillConfigPort;
}

export interface ReconcileResult {
  skipped: boolean;
  skills: number;
  /** Số hàng `UserSkillProgress` đã sửa cho khớp credit (log như metric `skill_reconcile_fixed_total`). */
  fixed: number;
  granted: number;
}

/**
 * Đánh giá lại + đối soát (p6-06 be.md §5):
 *  - `reevaluateSkill` — sau khi bật kỹ năng / đổi tiêu chí: duyệt người ĐỦ tiêu chí trên bảng tiến độ (lô theo `userId`) → cấp cho người chưa có
 *    (huy hiệu đã thu hồi không cấp lại — `evaluate` bỏ qua).
 *  - `nightly` — cron 02:30: dựng lại `UserSkillProgress` từ credit ACTIVE (nguồn sự thật) cho MỌI kỹ năng, rồi đánh giá lại kỹ năng đang bật.
 */
export class SkillReconcileService {
  constructor(private readonly d: SkillReconcileDeps) {}

  async reevaluateSkill(skillId: string): Promise<number> {
    const skill = await this.d.definitions.findById(skillId);
    return skill ? this.grantEligible(skill) : 0;
  }

  async reevaluateAll(): Promise<{ skills: number; granted: number }> {
    const skills = await this.d.definitions.listActive();
    let granted = 0;
    for (const s of skills) granted += await this.grantEligible(s);
    return { skills: skills.length, granted };
  }

  async nightly(): Promise<ReconcileResult> {
    if (!(await this.d.config.nightlyReconcile())) return { skipped: true, skills: 0, fixed: 0, granted: 0 };
    const skills = await this.d.definitions.listAll();
    let fixed = 0;
    let granted = 0;
    for (const skill of skills) {
      const rows = await this.d.credits.aggregateActive(skill.id);
      for (const r of rows) if (await this.d.progress.overwrite({ ...r, skillId: skill.id })) fixed += 1;
      fixed += await this.d.progress.zeroOthers(skill.id, rows.map((r) => r.userId));
      if (skill.isActive) granted += await this.grantEligible(skill);
    }
    return { skipped: false, skills: skills.length, fixed, granted };
  }

  private async grantEligible(skill: SkillDefinition): Promise<number> {
    if (!skill.isActive) return 0;
    let granted = 0;
    let after: string | undefined;
    for (;;) {
      const page = await this.d.progress.listEligiblePage({ skillId: skill.id, criteria: skill.criteria }, after, LIMITS.skill.batch);
      for (const userId of page) if (await this.d.evaluation.evaluate(userId, skill)) granted += 1;
      if (page.length < LIMITS.skill.batch) break;
      after = page[page.length - 1];
    }
    return granted;
  }
}
