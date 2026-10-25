import { LIMITS } from "../../../core/constants/limits";
import type { CoinQuest, CoinQuestMetric, CoinRule, CoinSourceTypeValue } from "../entities/coins.interface";
import type { ICoinQuestRepository } from "../repositories/quest.repository.interface";
import type { ICoinRuleRepository } from "../repositories/rule.repository.interface";

/**
 * Luật thưởng xu + nhiệm vụ đang bật, đọc qua bộ nhớ đệm TRONG TIẾN TRÌNH `LIMITS.coins.ruleCacheSeconds` (60 s) — đường nóng của consumer `xp.awarded` (mỗi sự kiện đều tra). Sửa luật/nhiệm vụ
 * có hiệu lực ≤ ngần này ở mọi instance, KHÔNG hồi tố; instance vừa ghi gọi `invalidate()` để thấy ngay. Luật chưa có (chưa seed) ⇒ `null` ⇒ sự kiện đó không thưởng xu.
 */
export class CoinCatalogCache {
  private rulesCache: { at: number; rules: Map<CoinSourceTypeValue, CoinRule> } | null = null;
  private questsCache: { at: number; quests: CoinQuest[] } | null = null;

  constructor(
    private readonly rules: ICoinRuleRepository,
    private readonly quests: ICoinQuestRepository,
    private readonly now: () => number = Date.now
  ) {}

  async rule(sourceType: CoinSourceTypeValue): Promise<CoinRule | null> {
    const t = this.now();
    if (!this.rulesCache || t - this.rulesCache.at >= LIMITS.coins.ruleCacheSeconds * 1000) {
      this.rulesCache = { at: t, rules: new Map((await this.rules.listAll()).map((r) => [r.sourceType, r] as const)) };
    }
    return this.rulesCache.rules.get(sourceType) ?? null;
  }

  async activeQuests(): Promise<CoinQuest[]> {
    const t = this.now();
    if (!this.questsCache || t - this.questsCache.at >= LIMITS.coins.ruleCacheSeconds * 1000) {
      this.questsCache = { at: t, quests: await this.quests.listActive() };
    }
    return this.questsCache.quests;
  }

  async questsForMetric(metric: CoinQuestMetric): Promise<CoinQuest[]> {
    return (await this.activeQuests()).filter((q) => q.metric === metric);
  }

  invalidate(): void {
    this.rulesCache = null;
    this.questsCache = null;
  }
}
