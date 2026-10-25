import { LIMITS } from "../../../core/constants/limits";
import type { ISkillDefinitionRepository } from "../repositories/skill-definition.repository.interface";
import type { IUserSkillProgressRepository } from "../repositories/skill-ledger.repository.interface";
import type { ISkillSourceRepository, LabelSuggestion } from "../repositories/skill-source.repository";
import { parseSkillCriteria } from "./skill-definitions.service";
import { NotFoundError } from "../../../core/exceptions";

export interface EligiblePreviewDto {
  eligibleCount: number;
  /** Đã có huy hiệu (kể cả đã thu hồi — không tự cấp lại). */
  alreadyHolding: number;
  /** Sẽ được cấp khi lưu + bật = đủ − đã có. */
  willGrant: number;
  /** ≤ 5, CHỈ id (không tên/email). */
  sampleUserIds: string[];
}

/**
 * Xem trước số người đủ điều kiện (admin.md §2.2, CR-27) — aggregate trên `UserSkillProgress` (không quét task), nên kể cả kỹ năng đang TẮT vẫn
 * có số liệu (credit được ghi cho mọi kỹ năng có nhãn khớp). Tiêu chí chưa lưu truyền qua `criteria` (JSON), vắng = tiêu chí đang lưu.
 */
export class SkillPreviewService {
  constructor(
    private readonly definitions: ISkillDefinitionRepository,
    private readonly progress: IUserSkillProgressRepository,
    private readonly source: ISkillSourceRepository
  ) {}

  async eligible(skillId: string, rawCriteria?: unknown): Promise<EligiblePreviewDto> {
    const skill = await this.definitions.findById(skillId);
    if (!skill) throw new NotFoundError("Không tìm thấy kỹ năng");
    const criteria = rawCriteria === undefined ? skill.criteria : parseSkillCriteria(rawCriteria);
    const r = await this.progress.previewEligible({ skillId, criteria }, LIMITS.skill.previewSampleMax);
    return { ...r, willGrant: Math.max(0, r.eligibleCount - r.alreadyHolding) };
  }

  labelSuggestions(q: string): Promise<LabelSuggestion[]> {
    return this.source.labelSuggestions(q, LIMITS.skill.labelSuggestionsMax);
  }
}
