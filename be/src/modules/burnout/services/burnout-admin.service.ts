import { BURNOUT_RULES_CONFIG_KEY } from "../../../core/constants/burnout";
import { VersionConflictError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import { addDaysToLocalDate } from "../../../core/utils/local-date";
import type { SystemConfigActor } from "../../system-config/public";
import { burnoutErrors } from "../burnout.errors";
import { groupLevelDistribution, isSufficient, roundToStep, suppressSmall, type LevelBucket } from "../domain/anonymity";
import { checkRuleSet, DEFAULT_BURNOUT_RULE_SET, type BurnoutRuleSet } from "../domain/burnout-rules";
import type { IBurnoutAggregateRepository } from "../repositories/aggregate.repository.interface";
import type { IBurnoutAudit, IBurnoutRulesAdminPort } from "./burnout.ports";

export type OverviewDto =
  | { insufficient: true; minimum: number }
  | {
      insufficient: false;
      /** Số người đang bật, LÀM TRÒN tới bội của 10 (không lộ số chính xác). */
      optInApprox: number;
      /** Số cảnh báo mỗi tuần (thứ Hai 00:00 UTC), cũ → mới; ô có 1..4 cảnh báo là `null` (che ô nhỏ). */
      alertsPerWeek: Array<{ weekStart: string; alerts: number | null }>;
      /** Phân bố mức hiện tại; nhóm < 5 người gộp vào `OTHER`; `null` khi số người ĐÃ được chấm điểm còn quá ít. */
      levelDistribution: LevelBucket[] | null;
    };

export interface RulesDto {
  version: number;
  windowDays: number;
  levels: { medium: number; high: number };
  rules: BurnoutRuleSet["rules"];
  updatedAt: string | null;
  updatedBy: string | null;
  /** `true` khi chưa từng lưu (hoặc bản lưu không hợp lệ) — đang dùng bộ luật mặc định theo đặc tả. */
  isDefault: boolean;
  /**
   * Bộ luật mặc định theo đặc tả (README §7) — cho nút "Về mặc định" ở admin ĐIỀN LẠI form mà KHÔNG chép hằng số sang admin (tránh lệch âm thầm
   * nếu mặc định đổi). `version` không kèm — máy chủ tự gán khi lưu (cùng cách `updateRulesSchema` bỏ `version`).
   */
  defaults: Pick<BurnoutRuleSet, "windowDays" | "levels" | "rules">;
}

export interface UpdateRulesInput {
  /** `version` bộ luật admin đang xem (từ `GET /admin/wellbeing/rules`) — lệch → 409 `RES_003`. */
  expectedVersion: number;
  reason: string;
  windowDays: number;
  levels: { medium: number; high: number };
  rules: BurnoutRuleSet["rules"];
}

const WEEK_MS = 7 * 86_400_000;
const MEASURE_STEP = 10;

/** Thứ Hai 00:00 UTC của tuần chứa `at`. */
function startOfWeekUtc(at: Date): Date {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000);
}

/**
 * Admin (p7-03 be.md §4 `/admin/wellbeing/*`) — ADMIN KHÔNG BAO GIỜ thấy dữ liệu một người: `overview` chỉ nhận SỐ ĐẾM từ `IBurnoutAggregateRepository` (không có hàm nào theo `userId`) rồi ẩn danh hoá (k ≥ 20 người,
 * ô nhỏ bị che); `rules` là cấu hình chứ không phải dữ liệu người dùng. Sửa luật: lý do bắt buộc, CAS theo `version` bộ luật, audit `wellbeing.rules-update`, có hiệu lực cho lần chấm kế tiếp (không tính lại quá khứ).
 */
export class BurnoutAdminService {
  private readonly now: () => Date;

  constructor(
    private readonly d: {
      aggregate: IBurnoutAggregateRepository;
      rules: IBurnoutRulesAdminPort;
      audit: IBurnoutAudit;
      now?: () => Date;
    }
  ) {
    this.now = d.now ?? (() => new Date());
  }

  async overview(weeks: number): Promise<OverviewDto> {
    const optIn = await this.d.aggregate.countEnabled();
    if (!isSufficient(optIn, LIMITS.wellbeing.anonymityMin)) return { insufficient: true, minimum: LIMITS.wellbeing.anonymityMin };

    const now = this.now();
    const thisWeek = startOfWeekUtc(now).getTime();
    const ranges = Array.from({ length: weeks }, (_, i) => {
      const from = new Date(thisWeek - (weeks - 1 - i) * WEEK_MS);
      return { from, to: new Date(from.getTime() + WEEK_MS) };
    });
    const sinceDate = addDaysToLocalDate(now.toISOString().slice(0, 10), -LIMITS.wellbeing.levelDistributionDays);
    const [counts, levels] = await Promise.all([Promise.all(ranges.map((r) => this.d.aggregate.countAlertedBetween(r.from, r.to))), this.d.aggregate.latestLevelCounts(sinceDate)]);

    return {
      insufficient: false,
      optInApprox: roundToStep(optIn, MEASURE_STEP),
      alertsPerWeek: ranges.map((r, i) => ({ weekStart: r.from.toISOString().slice(0, 10), alerts: suppressSmall(counts[i] ?? 0, LIMITS.wellbeing.cellMin) })),
      levelDistribution: groupLevelDistribution(levels, LIMITS.wellbeing.cellMin, LIMITS.wellbeing.anonymityMin),
    };
  }

  async rules(): Promise<RulesDto> {
    const snapshot = await this.d.rules.read();
    const { ruleSet } = snapshot;
    return {
      version: ruleSet.version,
      windowDays: ruleSet.windowDays,
      levels: ruleSet.levels,
      rules: ruleSet.rules,
      updatedAt: snapshot.updatedAt ? snapshot.updatedAt.toISOString() : null,
      updatedBy: snapshot.updatedBy,
      isDefault: snapshot.usedDefault || snapshot.updatedAt === null,
      defaults: { windowDays: DEFAULT_BURNOUT_RULE_SET.windowDays, levels: DEFAULT_BURNOUT_RULE_SET.levels, rules: DEFAULT_BURNOUT_RULE_SET.rules },
    };
  }

  async updateRules(input: UpdateRulesInput, actor: SystemConfigActor): Promise<RulesDto> {
    const candidate = { windowDays: input.windowDays, levels: input.levels, rules: input.rules };
    const issues = checkRuleSet(candidate);
    if (issues.some((i) => i.code === "LEVELS_ORDER")) throw burnoutErrors.levelsOrder();
    if (issues.length > 0) throw burnoutErrors.invalidRules(issues);

    const current = await this.d.rules.read();
    if (input.expectedVersion !== current.ruleSet.version) throw new VersionConflictError(current.ruleSet.version);

    const next: BurnoutRuleSet = { ...candidate, version: current.ruleSet.version + 1 };
    await this.d.rules.write(next, current.configVersion, input.reason, actor);
    await this.d.audit.record({
      actorId: actor.id,
      ...(actor.role !== undefined && { actorRole: actor.role }),
      action: "wellbeing.rules-update",
      targetType: "BurnoutRules",
      targetId: BURNOUT_RULES_CONFIG_KEY,
      reason: input.reason,
      metadata: { fromVersion: current.ruleSet.version, toVersion: next.version, windowDays: next.windowDays, ruleCount: next.rules.length },
    });
    return this.rules();
  }
}
