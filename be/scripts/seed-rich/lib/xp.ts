import { levelFromXp, DEFAULT_LEVEL_CONFIG } from "../../../src/modules/gamification/services/level";
import { DAY_MS, Directory, prisma } from "./core";
import type { SeededTask } from "./boards";
import type { SeededSet } from "./study";
import type { WorkspaceCtx } from "./workspace";

type XpSource = "TASK_COMPLETED" | "TASK_ON_TIME" | "STUDY_SET_PUBLISHED";

interface XpDraft {
  userKey: string;
  sourceType: XpSource;
  sourceId: string;
  workspaceId: string;
  at: Date;
}

const XP_FALLBACK: Record<XpSource, number> = { TASK_COMPLETED: 10, TASK_ON_TIME: 5, STUDY_SET_PUBLISHED: 20 };

function localDate(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Số ngày liên tiếp kết thúc ở ngày cuối + chuỗi dài nhất, từ danh sách ngày "YYYY-MM-DD". */
function streaks(dates: readonly string[]): { current: number; longest: number; last: string | null } {
  const days = [...new Set(dates)].sort();
  if (days.length === 0) return { current: 0, longest: 0, last: null };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = (Date.parse(days[i]) - Date.parse(days[i - 1])) / DAY_MS;
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current: run, longest, last: days[days.length - 1] };
}

/**
 * XP từ chính dữ liệu đã seed: thẻ ở cột DONE → TASK_COMPLETED (+ TASK_ON_TIME nếu xong trước hạn) cho từng người được giao; bộ học
 * PUBLIC → STUDY_SET_PUBLISHED cho chủ bộ. Ghi `XpEvent` (nguồn bảng xếp hạng nhóm), `XpDailyTotal`, `UserGamification` (cộng dồn — không
 * ghi đè điểm thật đã có) và huy hiệu "Bước đầu tiên"/"Tác giả". Idempotent theo `dedupeKey` của XpEvent.
 */
export async function seedXp(dir: Directory, ctx: WorkspaceCtx, tasks: readonly SeededTask[], sets: readonly SeededSet[]): Promise<number> {
  const drafts: XpDraft[] = [];
  for (const t of tasks) {
    if (!t.completedAt) continue;
    for (const key of t.assignees) {
      drafts.push({ userKey: key, sourceType: "TASK_COMPLETED", sourceId: t.id, workspaceId: ctx.id, at: t.completedAt });
      if (t.dueDate && t.completedAt <= t.dueDate) drafts.push({ userKey: key, sourceType: "TASK_ON_TIME", sourceId: t.id, workspaceId: ctx.id, at: t.completedAt });
    }
  }
  for (const s of sets) {
    if (s.visibility === "PUBLIC") drafts.push({ userKey: s.ownerKey, sourceType: "STUDY_SET_PUBLISHED", sourceId: s.id, workspaceId: ctx.id, at: s.createdAt });
  }
  if (drafts.length === 0) return 0;

  const rules = new Map((await prisma.xpRule.findMany({ select: { sourceType: true, xp: true, isActive: true } })).map((r) => [r.sourceType as string, r]));
  const delta = new Map<string, { xp: number; tasksDone: number; tasksOnTime: number; setsPublished: number; first: Date }>();
  let written = 0;

  for (const d of drafts) {
    const userId = dir.id(d.userKey);
    const dedupeKey = `${d.sourceType}:${d.sourceId}:${userId}`;
    if (await prisma.xpEvent.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;
    const rule = rules.get(d.sourceType);
    const xp = rule && rule.isActive ? rule.xp : rule ? 0 : XP_FALLBACK[d.sourceType];
    const day = localDate(d.at);
    await prisma.xpEvent.create({
      data: {
        dedupeKey,
        userId,
        sourceType: d.sourceType,
        sourceId: d.sourceId,
        workspaceId: d.workspaceId,
        xp,
        capped: false,
        blockedReason: null,
        localDate: day,
        occurredAt: d.at,
        actorId: null,
        reason: null,
        createdAt: d.at,
      },
    });
    await prisma.xpDailyTotal.upsert({
      where: { userId_sourceType_localDate: { userId, sourceType: d.sourceType, localDate: day } },
      create: { userId, sourceType: d.sourceType, localDate: day, xp },
      update: { xp: { increment: xp } },
    });
    const cur = delta.get(d.userKey) ?? { xp: 0, tasksDone: 0, tasksOnTime: 0, setsPublished: 0, first: d.at };
    cur.xp += xp;
    if (d.sourceType === "TASK_COMPLETED") cur.tasksDone += 1;
    if (d.sourceType === "TASK_ON_TIME") cur.tasksOnTime += 1;
    if (d.sourceType === "STUDY_SET_PUBLISHED") cur.setsPublished += 1;
    if (d.at < cur.first) cur.first = d.at;
    delta.set(d.userKey, cur);
    written += 1;
  }

  const badges = new Map((await prisma.badge.findMany({ where: { code: { in: ["first-task", "author-1"] } }, select: { id: true, code: true } })).map((b) => [b.code, b.id]));
  for (const [key, d] of delta) {
    const userId = dir.id(key);
    const days = (
      await prisma.xpEvent.findMany({ where: { userId, sourceType: "TASK_COMPLETED" }, select: { localDate: true } })
    ).map((e) => e.localDate);
    const st = streaks(days);
    const existing = await prisma.userGamification.findUnique({ where: { userId } });
    if (existing) {
      const xp = existing.xp + d.xp;
      await prisma.userGamification.update({
        where: { userId },
        data: {
          xp,
          level: Math.max(existing.level, levelFromXp(xp, DEFAULT_LEVEL_CONFIG)),
          counters: {
            ...existing.counters,
            tasksDone: existing.counters.tasksDone + d.tasksDone,
            tasksOnTime: existing.counters.tasksOnTime + d.tasksOnTime,
            setsPublished: existing.counters.setsPublished + d.setsPublished,
            longestStreak: Math.max(existing.counters.longestStreak, st.longest),
          },
        },
      });
    } else {
      const level = levelFromXp(d.xp, DEFAULT_LEVEL_CONFIG);
      await prisma.userGamification.create({
        data: {
          userId,
          xp: d.xp,
          level,
          streak: st.current,
          lastActiveDate: st.last,
          streakTz: "Asia/Ho_Chi_Minh",
          counters: { tasksDone: d.tasksDone, tasksOnTime: d.tasksOnTime, quizzesTaken: 0, quizzesPassed: 0, quizHighScores: 0, srReviews: 0, srReviewDays: 0, reviewsGiven: 0, setsPublished: d.setsPublished, longestStreak: st.longest },
          showcaseBadgeIds: [],
          levelUpSeenLevel: level,
        },
      });
    }
    for (const [code, earned] of [["first-task", d.tasksDone > 0], ["author-1", d.setsPublished > 0]] as const) {
      const badgeId = badges.get(code);
      if (!earned || !badgeId) continue;
      const have = await prisma.userBadge.findUnique({ where: { userId_badgeId: { userId, badgeId } }, select: { id: true } });
      if (!have) {
        await prisma.userBadge.create({ data: { userId, badgeId, unlockedAt: d.first, seenAt: new Date(d.first.getTime() + DAY_MS), via: "EVENT", revokedAt: null, revokedBy: null, revokeReason: null } });
      }
    }
  }
  return written;
}
