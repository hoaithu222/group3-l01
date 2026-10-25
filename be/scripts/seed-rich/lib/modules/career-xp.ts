/**
 * Ghi nhận XP cho các nguồn của phân hệ học tập (buổi lộ trình, ôn tập ngắt quãng, thi thử) theo ĐÚNG quy ước consumer `XpConsumerService`:
 *  - `XpEvent` idempotent theo `dedupeKey = "<sourceType>:<sourceId>:<userId>"`; xp = `round(rule.xp × factor)` rồi áp trần ngày (`applyDailyCap`,
 *    `XpDailyTotal`); luật tắt/chưa có → xp 0 (`RULE_INACTIVE`); vượt trần vẫn ghi sự kiện xp 0 `capped`.
 *  - `UserGamification` cộng dồn (xp, counters), cấp độ `max(cũ, levelFromXp)`, chuỗi ngày dựng lại từ MỌI `XpEvent` thuộc nguồn tính chuỗi
 *    (nên không lệch dù sự kiện của module khác cũ/mới hơn), `longestStreak` chỉ tăng.
 *  - Huy hiệu `UserBadge` cho các huy hiệu đang bật đã đủ điều kiện (không gửi thông báo, như `lib/xp.ts`).
 * Chỉ ghi cho người có sự kiện MỚI nên chạy lại không đổi gì.
 */
import { evaluateCriteria, criteriaSchema } from "../../../../src/shared/criteria/criteria-evaluator";
import { emptyCounters, STREAK_SOURCES, type GamificationCounters, type StoredCounterKey, type XpRule } from "../../../../src/modules/gamification/entities/gamification.interface";
import { DEFAULT_LEVEL_CONFIG, levelFromXp } from "../../../../src/modules/gamification/services/level";
import { applyActivity } from "../../../../src/modules/gamification/services/streak";
import { applyDailyCap, baseXp } from "../../../../src/modules/gamification/services/xp-calc";
import { localDate } from "../../../../src/core/utils/local-date";
import { prisma } from "../core";
import { chunk } from "./career-common";

export type XpSource = "ROADMAP_LESSON" | "SR_REVIEW" | "SR_REVIEW_DAY" | "QUIZ_SCORED" | "QUIZ_PASSED";

export interface XpDraft {
  userId: string;
  sourceType: XpSource;
  /** Thực thể nguồn (lessonId, `<itemId>:<ngày>`, ngày ôn, attemptId…) — KHÔNG phải dedupeKey outbox. */
  sourceId: string;
  at: Date;
  /** Hệ số nhân `rule.xp` (mặc định 1). */
  factor?: number;
  counters?: Partial<Record<StoredCounterKey, number>>;
}

const keyOf = (d: Pick<XpDraft, "sourceType" | "sourceId" | "userId">): string => `${d.sourceType}:${d.sourceId}:${d.userId}`;

export interface AwardResult {
  events: number;
  users: number;
  badges: number;
}

export async function awardXp(input: readonly XpDraft[], now: Date): Promise<AwardResult> {
  const result: AwardResult = { events: 0, users: 0, badges: 0 };
  if (input.length === 0) return result;

  // Loại sự kiện đã có (idempotent) và trùng trong chính lô.
  const unique = new Map<string, XpDraft>();
  for (const d of input) if (!unique.has(keyOf(d))) unique.set(keyOf(d), d);
  const have = new Set<string>();
  for (const part of chunk([...unique.keys()], 200)) {
    for (const r of await prisma.xpEvent.findMany({ where: { dedupeKey: { in: part } }, select: { dedupeKey: true } })) have.add(r.dedupeKey);
  }
  const fresh = [...unique.values()].filter((d) => !have.has(keyOf(d))).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (fresh.length === 0) return result;

  const rules = new Map((await prisma.xpRule.findMany()).map((r) => [r.sourceType as string, r]));
  const badges = (await prisma.badge.findMany({ where: { isActive: true } })).flatMap((b) => {
    const parsed = criteriaSchema.safeParse(b.criteria);
    return parsed.success ? [{ id: b.id, code: b.code, criteria: parsed.data }] : [];
  });
  const streakTypes = new Set<string>([...STREAK_SOURCES, ...[...rules.values()].filter((r) => r.countsForStreak).map((r) => r.sourceType as string)]);

  const byUser = new Map<string, XpDraft[]>();
  for (const d of fresh) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
  const tzOf = new Map((await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, timezone: true } })).map((u) => [u.id, u.timezone || "Asia/Ho_Chi_Minh"]));

  for (const [userId, drafts] of byUser) {
    const tz = tzOf.get(userId) ?? "Asia/Ho_Chi_Minh";
    const running = new Map<string, number>(); // `${src}|${day}` → tổng đã cộng trong ngày
    const touchedRows = new Map<string, { src: XpSource; day: string; delta: number }>();
    const preloaded = new Set<string>();
    const events: Array<{ dedupeKey: string; userId: string; sourceType: XpSource; sourceId: string; workspaceId: null; xp: number; capped: boolean; blockedReason: string | null; localDate: string; occurredAt: Date; actorId: null; reason: null; createdAt: Date }> = [];
    const counters: GamificationCounters = emptyCounters();
    let xpSum = 0;

    for (const d of drafts) {
      const day = localDate(d.at, tz);
      const rule = rules.get(d.sourceType) ?? null;
      const base = baseXp({ sourceType: d.sourceType, factor: d.factor ?? 1, occurredAt: d.at }, rule as unknown as XpRule | null, 0);
      const capRule = base.xp > 0 && rule && rule.dailyCap !== null ? rule.dailyCap : null;
      const dk = `${d.sourceType}|${day}`;
      if (capRule !== null && !preloaded.has(dk)) {
        const row = await prisma.xpDailyTotal.findUnique({ where: { userId_sourceType_localDate: { userId, sourceType: d.sourceType, localDate: day } } });
        running.set(dk, row?.xp ?? 0);
        preloaded.add(dk);
      }
      const { allowed, capped } = applyDailyCap(base.xp, capRule, running.get(dk) ?? 0);
      events.push({ dedupeKey: keyOf(d), userId, sourceType: d.sourceType, sourceId: d.sourceId, workspaceId: null, xp: allowed, capped, blockedReason: base.blockedReason, localDate: day, occurredAt: d.at, actorId: null, reason: null, createdAt: d.at });
      if (capRule !== null) {
        running.set(dk, (running.get(dk) ?? 0) + allowed);
        const t = touchedRows.get(dk) ?? { src: d.sourceType, day, delta: 0 };
        t.delta += allowed;
        touchedRows.set(dk, t);
      }
      xpSum += allowed;
      for (const [k, v] of Object.entries(d.counters ?? {})) counters[k as StoredCounterKey] += v ?? 0;
    }

    // Toàn bộ ghi của MỘT người trong một transaction: sự kiện, tổng ngày, UserGamification, huy hiệu (không để lệch nếu gián đoạn giữa chừng).
    const newBadges = await prisma.$transaction(
      async (tx) => {
        for (const part of chunk(events, 300)) await tx.xpEvent.createMany({ data: part });
        for (const t of touchedRows.values()) {
          await tx.xpDailyTotal.upsert({
            where: { userId_sourceType_localDate: { userId, sourceType: t.src, localDate: t.day } },
            create: { userId, sourceType: t.src, localDate: t.day, xp: t.delta },
            update: { xp: { increment: t.delta } },
          });
        }

        // Chuỗi ngày dựng lại từ mọi XpEvent thuộc nguồn tính chuỗi (kể cả sự kiện của module khác).
        const dates = [...new Set((await tx.xpEvent.findMany({ where: { userId, sourceType: { in: [...streakTypes] as never[] } }, select: { localDate: true } })).map((e) => e.localDate))].sort();
        let state = { streak: 0, lastActiveDate: null as string | null, longestStreak: 0 };
        for (const dte of dates) state = applyActivity(state, dte);

        const cur = await tx.userGamification.findUnique({ where: { userId } });
        const merged: GamificationCounters = { ...emptyCounters(), ...(cur?.counters ?? {}) };
        for (const k of Object.keys(counters) as StoredCounterKey[]) merged[k] += counters[k];
        merged.longestStreak = Math.max(merged.longestStreak, state.longestStreak);
        const xp = (cur?.xp ?? 0) + xpSum;
        const level = Math.max(cur?.level ?? 1, levelFromXp(xp, DEFAULT_LEVEL_CONFIG));
        const keep = cur !== null && cur.lastActiveDate !== null && state.lastActiveDate !== null && cur.lastActiveDate > state.lastActiveDate;
        const streak = keep && cur ? cur.streak : state.streak;
        const lastActiveDate = keep && cur ? cur.lastActiveDate : state.lastActiveDate;
        if (cur) {
          await tx.userGamification.update({ where: { userId }, data: { xp, level, streak, lastActiveDate, streakTz: tz, counters: merged, version: { increment: 1 } } });
        } else {
          await tx.userGamification.create({ data: { userId, xp, level, streak, lastActiveDate, streakTz: tz, counters: merged, showcaseBadgeIds: [], levelUpSeenLevel: level, version: 1 } });
        }

        const owned = new Set((await tx.userBadge.findMany({ where: { userId }, select: { badgeId: true } })).map((b) => b.badgeId));
        const lastAt = drafts[drafts.length - 1].at;
        let granted = 0;
        for (const b of badges) {
          if (owned.has(b.id) || !evaluateCriteria(b.criteria, { ...merged, level })) continue;
          await tx.userBadge.create({
            data: { userId, badgeId: b.id, unlockedAt: lastAt, seenAt: new Date(Math.min(lastAt.getTime() + 86_400_000, now.getTime())), via: "EVENT", revokedAt: null, revokedBy: null, revokeReason: null },
          });
          granted += 1;
        }
        return granted;
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
    result.badges += newBadges;
    result.events += events.length;
    result.users += 1;
  }
  return result;
}
