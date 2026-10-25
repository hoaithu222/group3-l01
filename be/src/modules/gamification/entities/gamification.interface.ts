import type { CounterKey } from "../../../shared/criteria/criteria-evaluator";

/**
 * Entity domain của gamification (p4-03) — khai ĐỘC LẬP với Prisma (khớp model cùng tên), tầng domain không import kiểu Prisma.
 */
export const XP_SOURCE_TYPES = [
  "TASK_COMPLETED",
  "TASK_ON_TIME",
  "QUIZ_SCORED",
  "QUIZ_PASSED",
  "SR_REVIEW",
  "SR_REVIEW_DAY",
  "REVIEW_SUBMITTED",
  "STUDY_SET_PUBLISHED",
  "POMODORO_CYCLE",
  /** p4-07 — hoàn thành buổi học lộ trình (không thuộc workspace nào, `workspaceId` luôn null). */
  "ROADMAP_LESSON",
  "ADMIN_ADJUST",
] as const;
export type XpSourceTypeValue = (typeof XP_SOURCE_TYPES)[number];

/** Nguồn luôn tính vào chuỗi ngày (ngoài các luật có `countsForStreak`). */
export const STREAK_SOURCES: ReadonlySet<XpSourceTypeValue> = new Set(["TASK_COMPLETED", "SR_REVIEW_DAY", "QUIZ_SCORED", "ROADMAP_LESSON"]);

export const BADGE_RARITIES = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;
export type BadgeRarityValue = (typeof BADGE_RARITIES)[number];

/** Counter LƯU trong `UserGamification.counters` (`level` là counter TÍNH TỪ cấp độ, không lưu). */
export type StoredCounterKey = Exclude<CounterKey, "level">;
export const STORED_COUNTER_KEYS: readonly StoredCounterKey[] = [
  "tasksDone",
  "tasksOnTime",
  "quizzesTaken",
  "quizzesPassed",
  "quizHighScores",
  "srReviews",
  "srReviewDays",
  "reviewsGiven",
  "setsPublished",
  "longestStreak",
];
export type GamificationCounters = Record<StoredCounterKey, number>;

export const emptyCounters = (): GamificationCounters => ({
  tasksDone: 0,
  tasksOnTime: 0,
  quizzesTaken: 0,
  quizzesPassed: 0,
  quizHighScores: 0,
  srReviews: 0,
  srReviewDays: 0,
  reviewsGiven: 0,
  setsPublished: 0,
  longestStreak: 0,
});

export interface XpRule {
  id: string;
  sourceType: XpSourceTypeValue;
  xp: number;
  dailyCap: number | null;
  countsForStreak: boolean;
  isActive: boolean;
  version: number;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface XpEvent {
  id: string;
  dedupeKey: string;
  userId: string;
  sourceType: XpSourceTypeValue;
  sourceId: string;
  workspaceId: string | null;
  xp: number;
  capped: boolean;
  blockedReason: string | null;
  localDate: string;
  occurredAt: Date;
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
}

export type XpEventCreateInput = Omit<XpEvent, "id" | "createdAt">;

export interface UserGamification {
  id: string;
  userId: string;
  xp: number;
  level: number;
  streak: number;
  lastActiveDate: string | null;
  streakTz: string | null;
  counters: GamificationCounters;
  showcaseBadgeIds: string[];
  levelUpSeenLevel: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Trường ghi vào `UserGamification` (CAS `version`, luôn `version + 1`). */
export type UserGamificationPatch = Partial<Pick<UserGamification, "xp" | "level" | "streak" | "lastActiveDate" | "streakTz" | "counters" | "showcaseBadgeIds" | "levelUpSeenLevel">>;

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  emoji: string | null;
  iconAssetId: string | null;
  criteria: unknown;
  counters: string[];
  rarity: BadgeRarityValue;
  isActive: boolean;
  order: number;
  version: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type BadgeCreateInput = Pick<Badge, "code" | "name" | "description" | "emoji" | "iconAssetId" | "criteria" | "counters" | "rarity" | "order" | "createdBy"> & {
  isActive?: boolean;
};
export type BadgePatch = Partial<Pick<Badge, "name" | "description" | "emoji" | "iconAssetId" | "criteria" | "counters" | "rarity" | "order" | "isActive">>;

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  unlockedAt: Date;
  seenAt: Date | null;
  via: string;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

/** Người dùng dưới góc nhìn gamification (chỉ trường cần — không email/số điện thoại). */
export interface GamUser {
  id: string;
  name: string;
  status: string;
  timezone: string;
  avatarAssetId: string | null;
  /** Mặc định `true` khi chưa từng đặt. */
  showInLeaderboard: boolean;
  showGamification: boolean;
}
