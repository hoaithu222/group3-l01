import { LIMITS } from "../../../core/constants/limits";
import { AppError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { XpRule, XpSourceTypeValue } from "../entities/gamification.interface";
import type { IXpRuleRepository, XpRuleWrite } from "../repositories/xp-rule.repository.interface";
import type { IGamAudit } from "./gamification.ports";

/**
 * Luật XP theo `sourceType` (p4-03 be.md §5.2 bước 1): consumer đọc qua bộ nhớ đệm TRONG TIẾN TRÌNH `LIMITS.gamification.ruleCacheSeconds`
 * (60 s — sửa luật có hiệu lực ≤ ngần này ở mọi instance, GM-11; instance đang sửa xoá đệm ngay). Sửa luật: CAS `version`, lý do, audit
 * `xp-rule.update` (giá trị cũ → mới); KHÔNG hồi tố.
 */
export class XpRuleService {
  private cache: { at: number; rules: Map<XpSourceTypeValue, XpRule> } | null = null;

  constructor(
    private readonly repo: IXpRuleRepository,
    private readonly audit: IGamAudit,
    private readonly now: () => number = Date.now
  ) {}

  async list(): Promise<XpRule[]> {
    return [...(await this.rules()).values()];
  }

  /** `null` = chưa có luật (chưa seed) — consumer coi như luật tắt (XP 0, counter vẫn tăng). */
  async get(sourceType: XpSourceTypeValue): Promise<XpRule | null> {
    return (await this.rules()).get(sourceType) ?? null;
  }

  async update(actor: AuthUser, sourceType: XpSourceTypeValue, dto: XpRuleWrite & { expectedVersion: number; reason: string }): Promise<XpRule> {
    const before = await this.repo.find(sourceType);
    if (!before) throw new AppError(ErrorMessages[ErrorCode.GAME_001], 404, ErrorCode.GAME_001);
    const after = await this.repo.updateIf(sourceType, dto.expectedVersion, { xp: dto.xp, dailyCap: dto.dailyCap, countsForStreak: dto.countsForStreak, isActive: dto.isActive }, actor.id);
    if (!after) throw new VersionConflictError((await this.repo.find(sourceType))?.version ?? before.version);
    this.cache = null;
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "xp-rule.update",
      targetType: "XpRule",
      targetId: sourceType,
      reason: dto.reason,
      metadata: { before: this.snapshot(before), after: this.snapshot(after) },
    });
    return after;
  }

  private snapshot(r: XpRule): XpRuleWrite & { version: number } {
    return { xp: r.xp, dailyCap: r.dailyCap, countsForStreak: r.countsForStreak, isActive: r.isActive, version: r.version };
  }

  private async rules(): Promise<Map<XpSourceTypeValue, XpRule>> {
    const t = this.now();
    if (this.cache && t - this.cache.at < LIMITS.gamification.ruleCacheSeconds * 1000) return this.cache.rules;
    const rules = new Map((await this.repo.listAll()).map((r) => [r.sourceType, r] as const));
    this.cache = { at: t, rules };
    return rules;
  }
}
