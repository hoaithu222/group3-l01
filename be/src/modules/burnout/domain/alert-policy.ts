import type { WellbeingLevel } from "./burnout-rules";

/**
 * Chính sách cảnh báo THUẦN (p7-03 README §2 "Cảnh báo", GM-09): chỉ MEDIUM/HIGH, người dùng còn bật cảnh báo, không đang "Nhắc lại sau", và cách lần cảnh báo trước ≥ 24 giờ. Mức LOW, tắt cảnh báo,
 * đang tạm hoãn đều KHÔNG cảnh báo — nhưng điểm vẫn được lưu để người dùng tự xem.
 */
export type AlertSkipReason = "LEVEL_LOW" | "ALERTS_DISABLED" | "SNOOZED" | "COOLDOWN";

export type AlertDecision = { alert: true } | { alert: false; reason: AlertSkipReason };

export interface AlertInput {
  level: WellbeingLevel;
  alertsEnabled: boolean;
  lastAlertAt: Date | null;
  snoozedUntil: Date | null;
  now: Date;
  cooldownHours: number;
  graceMinutes: number;
}

const MS_PER_MINUTE = 60_000;

/**
 * Mốc muộn nhất của `lastAlertAt` để được cảnh báo tiếp: `now − (cooldown − grace)`. `grace` bù độ lệch vài giây/phút giữa các lần job hằng ngày chạy (nếu không, cảnh báo lúc có lúc không tuỳ job
 * chạy sớm hay muộn vài giây). Cũng là điều kiện của cập nhật nguyên tử `claimAlert` ở repository — hai job chạy trùng chỉ một job thắng.
 */
export function cooldownCutoff(now: Date, cooldownHours: number, graceMinutes: number): Date {
  return new Date(now.getTime() - Math.max(0, cooldownHours * 60 - graceMinutes) * MS_PER_MINUTE);
}

export function decideAlert(input: AlertInput): AlertDecision {
  if (input.level === "LOW") return { alert: false, reason: "LEVEL_LOW" };
  if (!input.alertsEnabled) return { alert: false, reason: "ALERTS_DISABLED" };
  if (input.snoozedUntil !== null && input.snoozedUntil.getTime() > input.now.getTime()) return { alert: false, reason: "SNOOZED" };
  if (input.lastAlertAt !== null && input.lastAlertAt.getTime() > cooldownCutoff(input.now, input.cooldownHours, input.graceMinutes).getTime()) return { alert: false, reason: "COOLDOWN" };
  return { alert: true };
}

/** "Nhắc lại sau": tạm hoãn cảnh báo `cooldownHours` giờ kể từ lúc bấm. */
export function snoozeUntil(ackAt: Date, cooldownHours: number): Date {
  return new Date(ackAt.getTime() + cooldownHours * 60 * MS_PER_MINUTE);
}
