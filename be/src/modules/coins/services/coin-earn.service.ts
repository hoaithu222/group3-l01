import { createContextLogger } from "../../../infrastructure/logger";
import { localDate } from "../../../core/utils/local-date";
import { xpAwardedSchema } from "../../../shared/events/domain-events";
import { awardWithCaps, earnDedupeKey, isCoinSource, QUEST_METRIC_BY_SOURCE, xpRefId } from "../domain/coin-math";
import type { ICoinEarnEventRepository } from "../repositories/earn-event.repository.interface";
import type { IQuestProgressRepository } from "../repositories/quest.repository.interface";
import { UniqueViolationError, type ITxRunner } from "../repositories/tx";
import type { CoinCatalogCache } from "./coin-catalog.service";
import type { CoinLedgerService } from "./coin-ledger.service";
import type { ICoinsConfig, ICoinsEmitter, ICoinsMetrics } from "./coins.ports";
import type { ICoinsDirectory } from "../repositories/directory";

const log = createContextLogger({ service: "CoinEarnService" });

export interface CoinEarnDeps {
  catalog: CoinCatalogCache;
  earnEvents: ICoinEarnEventRepository;
  progress: IQuestProgressRepository;
  ledger: CoinLedgerService;
  directory: ICoinsDirectory;
  tx: ITxRunner;
  config: ICoinsConfig;
  emitter: ICoinsEmitter;
  metrics: ICoinsMetrics;
}

/** `GRANTED` có xu · `PROGRESS_ONLY` chỉ tính tiến độ nhiệm vụ · `CAPPED` hết trần ngày (vẫn tính tiến độ) · `DUPLICATE` đã xử lý · `SKIPPED` không áp dụng. */
export type EarnOutcome = "GRANTED" | "PROGRESS_ONLY" | "CAPPED" | "DUPLICATE" | "SKIPPED";

export interface EarnResult {
  outcome: EarnOutcome;
  coins: number;
}

const skipped: EarnResult = { outcome: "SKIPPED", coins: 0 };

/**
 * Thưởng xu theo sự kiện XP (p7-02 be.md §5 "Earn") — consumer của outbox `xp.awarded` (queue `gamification`). Chỉ nghe `xp.awarded` (XP THẬT > 0, đã qua chống farm của XP: tuổi tối thiểu của
 * thẻ, trần ngày) chứ KHÔNG nghe sự kiện gốc; không có đường nào thưởng xu từ hiện diện/giờ online.
 *
 * Idempotent theo sự kiện XP: `CoinEarnEvent.dedupeKey` (= `XpEvent.dedupeKey`) unique là MỎ NEO của cả thưởng xu lẫn tiến độ nhiệm vụ — sự kiện bị giao lại/retry (COIN-02) chỉ tác dụng đúng một lần.
 * MỘT transaction: [mỏ neo (câu GHI đầu tiên — trùng ⇒ lỗi thoát callback, bắt Ở NGOÀI)] → dòng sổ cái `EARN_EVENT` (nếu còn trần) → `$inc` tiến độ các nhiệm vụ khớp chỉ số. Trần ngày (mỗi luật
 * + chung `LIMITS.coins.dailyEarnCap` ⊕ override admin) tính từ `CoinEarnEvent` TRONG transaction; hai sự kiện của một người cùng ghi document ví ⇒ write-conflict ⇒ `withTransaction` chạy lại
 * tuần tự nên trần không bị vượt khi xử lý song song. ⛔ `ADMIN_ADJUST` (XP do admin cộng tay) không nằm trong `COIN_SOURCE_TYPES` ⇒ không đẻ ra xu.
 */
export class CoinEarnService {
  constructor(private readonly d: CoinEarnDeps) {}

  async handleXpAwarded(payload: unknown): Promise<EarnResult> {
    const parsed = xpAwardedSchema.safeParse(payload);
    if (!parsed.success) {
      // Payload hỏng KHÔNG ném (retry 3 lần cũng không đổi kết quả) — chỉ ghi lại để vận hành thấy.
      log.warn("Sự kiện xp.awarded không hợp lệ, bỏ qua", { issues: parsed.error.issues.length });
      return skipped;
    }
    const p = parsed.data;
    if (!isCoinSource(p.sourceType)) return skipped;
    if (!(await this.d.config.enabled())) {
      this.d.metrics.earnSkipped("DISABLED");
      return skipped;
    }
    const dedupeKey = earnDedupeKey(p.sourceType, p.sourceId, p.userId);
    if (await this.d.earnEvents.exists(dedupeKey)) return { outcome: "DUPLICATE", coins: 0 };

    const user = await this.d.directory.getUser(p.userId);
    if (!user || user.status === "ANONYMIZED") {
      this.d.metrics.earnSkipped("USER_INACTIVE");
      return skipped;
    }
    const rule = await this.d.catalog.rule(p.sourceType);
    const metric = QUEST_METRIC_BY_SOURCE[p.sourceType];
    const quests = metric ? await this.d.catalog.questsForMetric(metric) : [];
    const earning = rule !== null && rule.isActive && rule.coins > 0;
    if (!earning && quests.length === 0) {
      this.d.metrics.earnSkipped("NO_RULE");
      return skipped;
    }

    const day = localDate(new Date(p.at), user.timezone);
    // Các hàng khoá unique MỚI tạo NGOÀI transaction (hai giao dịch cùng tạo ⇒ P2002 không retry được).
    if (earning) await this.d.ledger.ensureWallets([p.userId]);
    if (quests.length > 0) await this.d.progress.ensure(p.userId, quests.map((q) => q.id), day);

    try {
      const out = await this.d.tx.run(async (tx) => {
        let allowed = 0;
        let capped = false;
        if (earning && rule) {
          const limits = await this.d.config.limits();
          // Tuần tự (không `Promise.all`): trong MỘT transaction Mongo các thao tác dùng chung một session, không chạy song song được.
          const earnedToday = await this.d.earnEvents.sumCoins(p.userId, day, null, tx);
          const earnedRuleToday = rule.dailyCap === null ? 0 : await this.d.earnEvents.sumCoins(p.userId, day, p.sourceType, tx);
          ({ allowed, capped } = awardWithCaps({ ruleCoins: rule.coins, ruleDailyCap: rule.dailyCap, earnedRuleToday, earnedToday, globalCap: limits.dailyEarnCap }));
        }
        await this.d.earnEvents.create({ dedupeKey, userId: p.userId, sourceType: p.sourceType, sourceId: p.sourceId, localDate: day, coins: allowed, capped }, tx);
        let balance: number | null = null;
        if (allowed > 0) {
          balance = (await this.d.ledger.credit(tx, { userId: p.userId, amount: allowed, type: "EARN_EVENT", refType: "XP_EVENT", refId: xpRefId(p.sourceType, p.sourceId) })).balance;
        }
        for (const quest of quests) await this.d.progress.increment(p.userId, quest.id, day, 1, tx);
        return { allowed, capped, balance };
      });
      if (out.allowed > 0 && out.balance !== null) {
        this.d.emitter.updated(p.userId, { coins: { balance: out.balance, delta: out.allowed, reason: "EARN_EVENT" } });
        return { outcome: "GRANTED", coins: out.allowed };
      }
      if (earning) this.d.metrics.earnSkipped("CAPPED");
      return { outcome: earning ? "CAPPED" : "PROGRESS_ONLY", coins: 0 };
    } catch (err) {
      // Trùng mỏ neo/dòng sổ cái = sự kiện đã được xử lý bởi lượt khác (giao lại/đua) — không phải lỗi.
      if (err instanceof UniqueViolationError) return { outcome: "DUPLICATE", coins: 0 };
      throw err;
    }
  }
}
