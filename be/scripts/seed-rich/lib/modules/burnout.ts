/**
 * Phân hệ Burnout radar / sức khoẻ học tập (module `burnout`). Dữ liệu của người ĐÃ BẬT theo dõi (opt-in): cài đặt, chỉ số từng ngày, điểm rủi ro, cảnh báo
 * và (tự nguyện) chia sẻ mức với nhóm.
 *
 * Ghi ĐÚNG như job `wellbeing.evaluate`: `WellbeingDaily` theo ngày wellbeing (ngày mới bắt đầu 05:00), tổng hợp lúc ~05:xx sáng hôm sau; `BurnoutAssessment` chấm bằng chính
 * `evaluateRules` với bộ luật mặc định (cửa sổ 7 ngày, cần ≥ 3 ngày dữ liệu) nên `riskScore`/`level`/`factors` suy ra được từ dữ liệu ngày; cảnh báo theo `decideAlert`
 * (≥ MEDIUM, tối đa 1 lần/24 giờ, tôn trọng tắt cảnh báo và "Nhắc lại sau") kèm thông báo hộp thư trung tính `wellbeing.alert` (`pushStatus: SKIPPED`). `ackAction/alertedAt/ackAt`
 * ghi `null` tường minh. Mọi hàng của một người được ghi TRƯỚC, `WellbeingSetting` ghi CUỐI CÙNG làm dấu hoàn tất: người đã có cài đặt (của seed lần trước hoặc người dùng thật,
 * kể cả đã tắt) bị bỏ qua nguyên vẹn. Không có nhãn y khoa hay lời khuyên nào trong dữ liệu.
 */
import { DEFAULT_BURNOUT_RULE_SET } from "../../../../src/core/constants/burnout";
import { LIMITS } from "../../../../src/core/constants/limits";
import { DEFAULT_TIME_ZONE, addDaysToLocalDate, localDate, startOfLocalDateKey } from "../../../../src/core/utils/local-date";
import { decideAlert, snoozeUntil } from "../../../../src/modules/burnout/domain/alert-policy";
import { evaluateRules, type RuleFactor, type WellbeingDay } from "../../../../src/modules/burnout/domain/rule-evaluator";
import { dayConfigFrom, wellbeingDateOf } from "../../../../src/modules/burnout/domain/wellbeing-day";
import { MIN_MS, prisma, rngFrom } from "../core";
import type { ModuleSeed } from "../module-ctx";
import { PROFILES, type Profile } from "./burnout.content";

const HOUR_MS = 3_600_000;
const THU = "thu";
const RULES = DEFAULT_BURNOUT_RULE_SET;
const round15 = (n: number): number => Math.round(n / 15) * 15;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function progression(p: Profile, t: number): number {
  if (p.shape === "late") return t ** 1.8;
  if (p.shape === "peak") {
    const at = p.peakAt ?? 0.5;
    return clamp(1 - Math.abs(t - at) / Math.max(at, 1 - at), 0, 1);
  }
  return t;
}

/** Số liệu từng ngày của một hồ sơ (tất định theo khoá người). Ràng buộc theo bộ thu thập thật: bội của 15 phút, mỗi khe hoạt động có ≥ 1 sự kiện, khuya ⊂ hoạt động. */
export function buildSeries(p: Profile, dates: readonly string[]): WellbeingDay[] {
  const rnd = rngFrom(`wellbeing:${p.key}`);
  const n = dates.length;
  return dates.map((date, i) => {
    const k = progression(p, n > 1 ? i / (n - 1) : 1);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    let active = lerp(p.active[0], p.active[1], k) * (1 + (rnd() - 0.5) * 0.22);
    if (weekday === 0 || weekday === 6) active *= p.weekend ?? 0.75;
    active = clamp(round15(active), 45, 780);
    let cont = lerp(p.cont[0], p.cont[1], k) * (1 + (rnd() - 0.5) * 0.3);
    if (p.longDaysAgo?.includes(n - 1 - i)) cont = Math.max(cont, 195 + rnd() * 30);
    cont = clamp(round15(cont), 15, active);
    let lateNightMinutes = 0;
    if (rnd() < lerp(p.lateProb[0], p.lateProb[1], p.shape === "late" ? k ** 1.6 : k)) lateNightMinutes = clamp(round15(p.late[0] + rnd() * (p.late[1] - p.late[0])), 15, Math.min(360, active));
    const slots = active / 15;
    const eventsCount = Math.max(slots, Math.round(slots * (1.8 + rnd() * 1.7)));
    const lateSlots = lateNightMinutes / 15;
    const lateNightEvents = lateNightMinutes > 0 ? Math.min(eventsCount, Math.max(lateSlots, Math.round(lateSlots * (1.4 + rnd() * 1.2)))) : 0;
    return { date, activeMinutes: active, longestContinuousMinutes: cont, lateNightMinutes, eventsCount, lateNightEvents };
  });
}

export const seedBurnout: ModuleSeed = async (c) => {
  const { dir, now } = c;
  const nowMs = now.getTime();
  const cfg = dayConfigFrom(LIMITS.wellbeing);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: PROFILES.map((p) => dir.id(p.key)) } }, select: { id: true, createdAt: true, timezone: true } })).map((u) => [u.id, u]));
  const counts = { users: 0, dailies: 0, assessments: 0, alerts: 0, notifications: 0, shares: 0, skipped: 0 };

  for (const p of PROFILES) {
    const userId = dir.id(p.key);
    const user = users.get(userId);
    if (!user || (await prisma.wellbeingSetting.findUnique({ where: { userId }, select: { id: true } }))) {
      counts.skipped += 1;
      continue;
    }
    const tz = user.timezone || DEFAULT_TIME_ZONE;
    const lastDate = addDaysToLocalDate(wellbeingDateOf(now, tz, cfg), -1);
    // Ngày đầu: không trước ngày sau khi tạo tài khoản (tài khoản thật `thu` có từ trước nên không chặn).
    const earliest = p.key === THU ? "0000-00-00" : addDaysToLocalDate(localDate(user.createdAt, tz), 1);
    const dates: string[] = [];
    for (let i = p.days - 1; i >= 0; i--) {
      const d = addDaysToLocalDate(lastDate, -i);
      if (d >= earliest) dates.push(d);
    }
    if (dates.length < LIMITS.wellbeing.minDailiesForAssessment) {
      counts.skipped += 1;
      continue;
    }
    const series = buildSeries(p, dates);
    const rnd = rngFrom(`wellbeing-sim:${p.key}`);
    // Giờ job tổng hợp ngày D: ~05:05–05:35 sáng hôm sau (giờ địa phương).
    const jobAt = (date: string): Date => new Date(Math.min(startOfLocalDateKey(addDaysToLocalDate(date, 1), tz).getTime() + 5 * HOUR_MS + (5 + Math.floor(rnd() * 30)) * MIN_MS, nowMs - MIN_MS));

    // Chỉ số ngày.
    const at = new Map(dates.map((d) => [d, jobAt(d)]));
    for (const s of series) {
      await prisma.wellbeingDaily.create({
        data: {
          userId, date: s.date, timezone: tz, activeMinutes: s.activeMinutes, longestContinuousMinutes: s.longestContinuousMinutes, lateNightMinutes: s.lateNightMinutes,
          eventsCount: s.eventsCount, lateNightEvents: s.lateNightEvents, createdAt: at.get(s.date) as Date,
        },
      });
      counts.dailies += 1;
    }

    // Điểm rủi ro + cảnh báo (mô phỏng đúng thứ tự job chạy từng sáng).
    const state: { lastAlertAt: Date | null; snoozedUntil: Date | null } = { lastAlertAt: null, snoozedUntil: null };
    const alertedIds: Array<{ id: string; at: Date; ackAt: Date | null; createdAt: Date }> = [];
    for (let i = 0; i < series.length; i++) {
      const date = dates[i];
      const window = series.filter((s) => s.date <= date && s.date >= addDaysToLocalDate(date, -(RULES.windowDays - 1)));
      if (window.length < LIMITS.wellbeing.minDailiesForAssessment) continue;
      const ev = evaluateRules(RULES, window, date);
      const when = new Date((at.get(date) as Date).getTime() + 20_000);
      const decision = decideAlert({ level: ev.level, alertsEnabled: p.alerts, lastAlertAt: state.lastAlertAt, snoozedUntil: state.snoozedUntil, now: when, cooldownHours: LIMITS.wellbeing.alertCooldownHours, graceMinutes: LIMITS.wellbeing.alertCooldownGraceMinutes });
      const alerted = decision.alert;
      const row = await prisma.burnoutAssessment.create({
        data: {
          userId, date, riskScore: ev.riskScore, level: ev.level, factors: ev.factors as RuleFactor[] as unknown as object[], ruleVersion: RULES.version,
          alerted, alertedAt: alerted ? when : null, ackAction: null, ackAt: null, createdAt: when,
        },
      });
      counts.assessments += 1;
      if (alerted) {
        state.lastAlertAt = when;
        alertedIds.push({ id: row.id, at: when, ackAt: null, createdAt: when });
        counts.alerts += 1;
      }
    }

    // Người dùng phản hồi cảnh báo: phần lớn bấm "Đã hiểu", một số "Nhắc lại sau", một số bỏ qua; cảnh báo mới nhất có thể còn chờ.
    for (let j = 0; j < alertedIds.length; j++) {
      const a = alertedIds[j];
      if (p.pendingLatest && j === alertedIds.length - 1) continue;
      const r = rnd();
      if (r >= 0.75) continue;
      const ackAt = new Date(Math.min(a.at.getTime() + (1 + Math.floor(rnd() * 6)) * HOUR_MS + Math.floor(rnd() * 50) * MIN_MS, nowMs - MIN_MS));
      const action = r < 0.55 ? "DISMISS" : "SNOOZE";
      await prisma.burnoutAssessment.update({ where: { id: a.id }, data: { ackAction: action, ackAt } });
      a.ackAt = ackAt;
      if (action === "SNOOZE") state.snoozedUntil = snoozeUntil(ackAt, LIMITS.wellbeing.alertCooldownHours);
    }

    // Thông báo hộp thư (trung tính, không mức/điểm): chưa đọc chỉ với cảnh báo mới nhất chưa được xử lý.
    for (let j = 0; j < alertedIds.length; j++) {
      const a = alertedIds[j];
      const dedupeKey = `wellbeing.alert:assessment:${a.id}`;
      if (await prisma.notification.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;
      const isLast = j === alertedIds.length - 1;
      const readAt = a.ackAt ?? (isLast && p.pendingLatest ? null : new Date(Math.min(a.at.getTime() + 6 * HOUR_MS, nowMs - MIN_MS)));
      await prisma.notification.create({
        data: {
          type: "wellbeing.alert", scopeType: "NONE", sourceType: "BurnoutAssessment", sourceId: a.id, refs: { assessmentId: a.id }, dedupeKey, createdAt: a.at,
          recipients: {
            create: {
              recipientId: userId, kind: "DEFAULT", inInbox: true, dedupeKey: a.id, scopeType: "NONE", readAt, seenAt: null, pushStatus: "SKIPPED", skipReason: "NO_DEVICE",
              deliveredPushAt: null, createdAt: new Date(a.at.getTime() + 500), kindRank: 0, streamKey: null, streamSeq: null, filterBucket: "all", cancelledAt: null,
            },
          },
        },
      });
      counts.notifications += 1;
    }

    const optedInAt = new Date(startOfLocalDateKey(dates[0], tz).getTime() + (8 + Math.floor(rnd() * 10)) * HOUR_MS);

    // Chia sẻ mức với nhóm (tự nguyện) — chỉ khi đang là thành viên của nhóm đó.
    const ws = p.shareWith ? c.workspaces.get(p.shareWith) : undefined;
    if (ws && p.shareWith && ws.roles.has(p.key)) {
      const shareAt = new Date(Math.min(optedInAt.getTime() + 2 * HOUR_MS + Math.floor(rnd() * 20) * HOUR_MS, nowMs - MIN_MS));
      if (!(await prisma.wellbeingShare.findUnique({ where: { userId_workspaceId: { userId, workspaceId: ws.id } }, select: { id: true } }))) {
        await prisma.wellbeingShare.create({ data: { userId, workspaceId: ws.id, createdAt: shareAt } });
        counts.shares += 1;
      }
    }

    // Dấu hoàn tất: cài đặt theo dõi.
    await prisma.wellbeingSetting.create({
      data: {
        userId, optedInAt, optedOutAt: null, alertsEnabled: p.alerts, preferredBreak: p.breakPlan ?? null, lastAlertAt: state.lastAlertAt, snoozedUntil: state.snoozedUntil,
        updatedAt: new Date(Math.max(state.lastAlertAt?.getTime() ?? 0, optedInAt.getTime())),
      },
    });
    counts.users += 1;
  }

  const c2 = counts;
  return `Burnout: +${c2.users} người bật theo dõi, +${c2.dailies} ngày chỉ số, +${c2.assessments} đánh giá (${c2.alerts} cảnh báo, +${c2.notifications} thông báo), +${c2.shares} chia sẻ${c2.skipped ? `, ${c2.skipped} người bỏ qua (đã có cài đặt/quá ít ngày)` : ""}`;
};
