import type { BurnoutSuggestion, WellbeingLevel } from "../domain/burnout-rules";
import { suggestionOf, type RuleFactor } from "../domain/rule-evaluator";
import type { AckAction, BurnoutAssessmentEntity, PreferredBreak, WellbeingDailyEntity, WellbeingSettingEntity } from "../entities/burnout.interface";
import { isTrackingEnabled } from "../entities/burnout.interface";

/** DTO trả cho CHÍNH người dùng (mọi chi tiết đều CHỈ dành cho họ). Ngày là chuỗi `YYYY-MM-DD` (ngày wellbeing), mốc thời gian là ISO. */
export interface DailyDto {
  date: string;
  activeMinutes: number;
  longestContinuousMinutes: number;
  lateNightMinutes: number;
  eventsCount: number;
  lateNightEvents: number;
}

export interface AssessmentDto {
  id: string;
  date: string;
  riskScore: number;
  level: WellbeingLevel;
  factors: RuleFactor[];
  suggestion: BurnoutSuggestion | null;
  ruleVersion: number;
  alerted: boolean;
  alertedAt: string | null;
  ackAction: AckAction | null;
  ackAt: string | null;
}

/** Cảnh báo đã gửi mà chưa được bấm "Đã hiểu"/"Nhắc lại sau" — app hiện toast khi mở lại (WELL-05). */
export interface PendingAlertDto {
  id: string;
  level: WellbeingLevel;
  suggestion: BurnoutSuggestion | null;
}

export interface SettingDto {
  enabled: boolean;
  optedInAt: string | null;
  alertsEnabled: boolean;
  preferredBreak: PreferredBreak | null;
  /** Đánh giá mới nhất (chỉ khi đang bật và đã đủ dữ liệu). */
  latest: AssessmentDto | null;
  pendingAlert: PendingAlertDto | null;
}

export const presentDaily = (d: WellbeingDailyEntity): DailyDto => ({
  date: d.date,
  activeMinutes: d.activeMinutes,
  longestContinuousMinutes: d.longestContinuousMinutes,
  lateNightMinutes: d.lateNightMinutes,
  eventsCount: d.eventsCount,
  lateNightEvents: d.lateNightEvents,
});

export const presentAssessment = (a: BurnoutAssessmentEntity): AssessmentDto => ({
  id: a.id,
  date: a.date,
  riskScore: a.riskScore,
  level: a.level,
  factors: a.factors,
  suggestion: suggestionOf(a.factors),
  ruleVersion: a.ruleVersion,
  alerted: a.alerted,
  alertedAt: a.alertedAt ? a.alertedAt.toISOString() : null,
  ackAction: a.ackAction,
  ackAt: a.ackAt ? a.ackAt.toISOString() : null,
});

/** `setting = null` (chưa từng bật) → mặc định TẮT; không có chi tiết nào ngoài mặc định. */
export function presentSetting(setting: WellbeingSettingEntity | null, recent: readonly BurnoutAssessmentEntity[]): SettingDto {
  if (setting === null || !isTrackingEnabled(setting)) return { enabled: false, optedInAt: null, alertsEnabled: true, preferredBreak: null, latest: null, pendingAlert: null };
  const latest = recent.at(-1) ?? null;
  const pending = [...recent].reverse().find((a) => a.alerted && a.ackAction === null) ?? null;
  return {
    enabled: true,
    optedInAt: setting.optedInAt ? setting.optedInAt.toISOString() : null,
    alertsEnabled: setting.alertsEnabled,
    preferredBreak: setting.preferredBreak,
    latest: latest ? presentAssessment(latest) : null,
    pendingAlert: pending ? { id: pending.id, level: pending.level, suggestion: suggestionOf(pending.factors) } : null,
  };
}
