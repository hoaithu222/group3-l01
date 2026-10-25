import type { PrismaClient } from "@prisma/client";
import { criteriaCounters, criteriaSchema, type Criteria } from "../../../shared/criteria/criteria-evaluator";

/**
 * Seed ĐỀ XUẤT của p4-03 (README §7 — CHỦ DỰ ÁN DUYỆT trước khi bật cờ `gamification`, cổng ra Phase 4 #3). Idempotent theo `sourceType`/`code`: CHỈ TẠO khi
 * thiếu, KHÔNG BAO GIỜ ghi đè bản admin đã sửa. Nhận `PrismaClient` của script `prisma/seed.ts` (không dùng singleton của ứng dụng để script tự thoát).
 * ⛔ Không có huy hiệu dựa giờ khuya/online — counter whitelist không có (`criteria-evaluator.ts`).
 */
export interface XpRuleSeed {
  sourceType: "TASK_COMPLETED" | "TASK_ON_TIME" | "QUIZ_SCORED" | "QUIZ_PASSED" | "SR_REVIEW" | "SR_REVIEW_DAY" | "REVIEW_SUBMITTED" | "STUDY_SET_PUBLISHED" | "POMODORO_CYCLE" | "ROADMAP_LESSON";
  xp: number;
  dailyCap: number | null;
  countsForStreak: boolean;
  isActive: boolean;
}

export const XP_RULE_SEEDS: readonly XpRuleSeed[] = [
  { sourceType: "TASK_COMPLETED", xp: 10, dailyCap: 100, countsForStreak: true, isActive: true },
  { sourceType: "TASK_ON_TIME", xp: 5, dailyCap: 50, countsForStreak: false, isActive: true },
  { sourceType: "QUIZ_SCORED", xp: 20, dailyCap: 60, countsForStreak: true, isActive: true },
  { sourceType: "QUIZ_PASSED", xp: 10, dailyCap: 30, countsForStreak: false, isActive: true },
  // Ôn tập tính XP THEO NGÀY (không theo thẻ): `SR_REVIEW` chỉ đếm counter (xp 0), `SR_REVIEW_DAY` thưởng một lần/ngày.
  { sourceType: "SR_REVIEW", xp: 0, dailyCap: null, countsForStreak: false, isActive: true },
  { sourceType: "SR_REVIEW_DAY", xp: 15, dailyCap: null, countsForStreak: true, isActive: true },
  { sourceType: "REVIEW_SUBMITTED", xp: 8, dailyCap: 40, countsForStreak: false, isActive: true },
  { sourceType: "STUDY_SET_PUBLISHED", xp: 20, dailyCap: 20, countsForStreak: false, isActive: true },
  // P2 (p5-02) — chỉ bật sau khi chốt chống gian lận.
  { sourceType: "POMODORO_CYCLE", xp: 5, dailyCap: 50, countsForStreak: false, isActive: false },
  // p4-07 (RM-14) — một buổi lộ trình ~ một buổi ôn tập đáng kể/ngày (ngang `SR_REVIEW_DAY`); cap 90 cho phép dồn ~6 buổi/ngày khi bắt kịp lịch (dời lịch) mà vẫn chặn farm.
  { sourceType: "ROADMAP_LESSON", xp: 15, dailyCap: 90, countsForStreak: true, isActive: true },
];

export interface BadgeSeed {
  code: string;
  name: string;
  description: string;
  emoji: string;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
  order: number;
  criteria: Criteria;
}

const gte = (counter: Criteria["all"][number]["counter"], value: number): Criteria => ({ all: [{ counter, op: "gte", value }] });

export const BADGE_SEEDS: readonly BadgeSeed[] = [
  { code: "first-task", name: "Bước đầu tiên", description: "Hoàn thành thẻ công việc đầu tiên", emoji: "🚀", rarity: "COMMON", order: 10, criteria: gte("tasksDone", 1) },
  { code: "tasks-50", name: "Chăm chỉ", description: "Hoàn thành 50 thẻ công việc", emoji: "💪", rarity: "RARE", order: 20, criteria: gte("tasksDone", 50) },
  { code: "on-time-20", name: "Đúng hẹn", description: "Hoàn thành 20 thẻ đúng hạn", emoji: "⏰", rarity: "RARE", order: 30, criteria: gte("tasksOnTime", 20) },
  { code: "streak-7", name: "Bền bỉ 7 ngày", description: "Giữ chuỗi hoạt động 7 ngày liên tiếp", emoji: "🔥", rarity: "COMMON", order: 40, criteria: gte("longestStreak", 7) },
  { code: "streak-30", name: "Bền bỉ 30 ngày", description: "Giữ chuỗi hoạt động 30 ngày liên tiếp", emoji: "🌋", rarity: "EPIC", order: 50, criteria: gte("longestStreak", 30) },
  { code: "sr-days-30", name: "Ôn đều tay", description: "Ôn tập ngắt quãng đủ 30 ngày", emoji: "🧠", rarity: "RARE", order: 60, criteria: gte("srReviewDays", 30) },
  { code: "mock-pass-10", name: "Vượt vũ môn", description: "Đạt 10 bài thi thử", emoji: "🎯", rarity: "RARE", order: 70, criteria: gte("quizzesPassed", 10) },
  { code: "reviewer-20", name: "Người chấm tận tâm", description: "Chấm chéo 20 lần", emoji: "🔍", rarity: "RARE", order: 80, criteria: gte("reviewsGiven", 20) },
  { code: "author-1", name: "Tác giả", description: "Công khai bộ học đầu tiên", emoji: "📚", rarity: "COMMON", order: 90, criteria: gte("setsPublished", 1) },
  { code: "level-10", name: "Cấp 10", description: "Đạt cấp độ 10", emoji: "🏅", rarity: "EPIC", order: 100, criteria: gte("level", 10) },
];

/** Tạo luật XP + huy hiệu còn thiếu. Trả số bản ghi tạo mới (chạy lại = 0). */
export async function seedGamification(client: PrismaClient): Promise<{ xpRules: number; badges: number }> {
  const haveRules = new Set((await client.xpRule.findMany({ select: { sourceType: true } })).map((r) => r.sourceType as string));
  const rules = XP_RULE_SEEDS.filter((r) => !haveRules.has(r.sourceType));
  // `dailyCap`/`updatedBy` ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
  if (rules.length > 0) await client.xpRule.createMany({ data: rules.map((r) => ({ ...r, updatedBy: null })) });

  const haveBadges = new Set((await client.badge.findMany({ select: { code: true } })).map((b) => b.code));
  let badges = 0;
  for (const b of BADGE_SEEDS.filter((s) => !haveBadges.has(s.code))) {
    const criteria = criteriaSchema.parse(b.criteria);
    await client.badge.create({
      data: { code: b.code, name: b.name, description: b.description, emoji: b.emoji, iconAssetId: null, criteria, counters: criteriaCounters(criteria), rarity: b.rarity, isActive: true, order: b.order, createdBy: null },
    });
    badges += 1;
  }
  return { xpRules: rules.length, badges };
}
