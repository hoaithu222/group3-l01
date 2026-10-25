import { LIMITS } from "../../../core/constants/limits";
import { addDaysToLocalDate } from "../../../core/utils/local-date";
import { cooldownCutoff, decideAlert, type AlertSkipReason } from "../domain/alert-policy";
import type { BurnoutRuleSet, WellbeingLevel } from "../domain/burnout-rules";
import { evaluateRules, type WellbeingDay } from "../domain/rule-evaluator";
import { isTrackingEnabled } from "../entities/burnout.interface";
import type { IBurnoutAssessmentRepository } from "../repositories/assessment.repository.interface";
import type { IWellbeingDailyRepository } from "../repositories/daily.repository.interface";
import type { IWellbeingSettingRepository } from "../repositories/setting.repository.interface";
import type { ITxRunner } from "../repositories/tx";
import type { IBurnoutEmitter, IBurnoutNotifier } from "./burnout.ports";

export type AssessOutcome =
  | { kind: "SKIPPED"; reason: "NOT_OPTED_IN" | "INSUFFICIENT_DATA" }
  | { kind: "SCORED"; assessmentId: string; level: WellbeingLevel; alerted: boolean; skipReason?: AlertSkipReason | "ALREADY_ALERTED" | "RACE_LOST" };

export interface AssessorDeps {
  settings: IWellbeingSettingRepository;
  dailies: IWellbeingDailyRepository;
  assessments: IBurnoutAssessmentRepository;
  notifier: IBurnoutNotifier;
  emitter: IBurnoutEmitter;
  tx: ITxRunner;
  now?: () => Date;
}

/**
 * Chấm điểm + cảnh báo (p7-03 be.md §5 "Assessor"). Quyền riêng tư: người CHƯA bật (hoặc đã tắt) không bao giờ có `BurnoutAssessment` (GM-08) — kiểm ngay ở đây chứ không chỉ tin người gọi.
 * Cảnh báo tối đa 1 lần/24 giờ: quyết định bằng hàm thuần (`decideAlert`) rồi CHIẾM quyền bằng MỘT lệnh có điều kiện (`claimAlert`) trong cùng transaction với dấu "đã cảnh báo" + thông báo hộp thư — hai job
 * chạy trùng/song song chỉ một bên thắng (GM-09); phát socket SAU commit (hỏng cũng không mất cảnh báo — hộp thư + `GET /me/wellbeing` là nguồn sự thật).
 */
export class BurnoutAssessorService {
  private readonly now: () => Date;

  constructor(private readonly d: AssessorDeps) {
    this.now = d.now ?? (() => new Date());
  }

  /** Chấm ngày wellbeing `asOfDate` của `userId` bằng bộ luật `rules`. */
  async assess(userId: string, asOfDate: string, rules: BurnoutRuleSet): Promise<AssessOutcome> {
    const setting = await this.d.settings.findByUserId(userId);
    if (setting === null || !isTrackingEnabled(setting)) return { kind: "SKIPPED", reason: "NOT_OPTED_IN" };

    const windowStart = addDaysToLocalDate(asOfDate, -(rules.windowDays - 1));
    const rows = (await this.d.dailies.listSince(userId, windowStart)).filter((r) => r.date <= asOfDate);
    if (rows.length < LIMITS.wellbeing.minDailiesForAssessment) return { kind: "SKIPPED", reason: "INSUFFICIENT_DATA" };

    const days: WellbeingDay[] = rows.map((r) => ({
      date: r.date,
      activeMinutes: r.activeMinutes,
      longestContinuousMinutes: r.longestContinuousMinutes,
      lateNightMinutes: r.lateNightMinutes,
      eventsCount: r.eventsCount,
      lateNightEvents: r.lateNightEvents,
    }));
    const evaluation = evaluateRules(rules, days, asOfDate);
    const assessment = await this.d.assessments.upsertScore({ userId, date: asOfDate, riskScore: evaluation.riskScore, level: evaluation.level, factors: evaluation.factors, ruleVersion: rules.version });
    const scored = { kind: "SCORED", assessmentId: assessment.id, level: assessment.level } as const;

    if (assessment.alerted) return { ...scored, alerted: false, skipReason: "ALREADY_ALERTED" };
    const now = this.now();
    const decision = decideAlert({
      level: assessment.level,
      alertsEnabled: setting.alertsEnabled,
      lastAlertAt: setting.lastAlertAt,
      snoozedUntil: setting.snoozedUntil,
      now,
      cooldownHours: LIMITS.wellbeing.alertCooldownHours,
      graceMinutes: LIMITS.wellbeing.alertCooldownGraceMinutes,
    });
    if (!decision.alert) return { ...scored, alerted: false, skipReason: decision.reason };

    const notAfter = cooldownCutoff(now, LIMITS.wellbeing.alertCooldownHours, LIMITS.wellbeing.alertCooldownGraceMinutes);
    const claimed = await this.d.tx.run(async (tx) => {
      if (!(await this.d.settings.claimAlert(userId, notAfter, now, tx))) return false;
      await this.d.assessments.markAlerted(assessment.id, now, tx);
      await this.d.notifier.alert(tx, { userId, assessmentId: assessment.id });
      return true;
    });
    if (!claimed) return { ...scored, alerted: false, skipReason: "RACE_LOST" };

    // `level` là MEDIUM/HIGH (LOW đã bị `decideAlert` loại) — hẹp kiểu để payload socket không nhận LOW.
    if (assessment.level !== "LOW") this.d.emitter.alert(userId, { assessmentId: assessment.id, level: assessment.level, suggestion: evaluation.suggestion });
    return { ...scored, alerted: true };
  }
}
