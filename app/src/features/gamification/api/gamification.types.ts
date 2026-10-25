/**
 * Kiểu phản hồi gamification — khớp `gamification.presenter.ts`, `gamification-query.service.ts`,
 * `leaderboard.service.ts` ở BE (p4-03). Chỉ ĐỌC + tự chọn trưng bày; không có endpoint cấp XP/huy hiệu.
 */
export type BadgeRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type LeaderboardPeriod = 'WEEK' | 'MONTH' | 'ALL';

export type XpSourceType =
  | 'TASK_COMPLETED'
  | 'TASK_ON_TIME'
  | 'QUIZ_SCORED'
  | 'QUIZ_PASSED'
  | 'SR_REVIEW'
  | 'SR_REVIEW_DAY'
  | 'REVIEW_SUBMITTED'
  | 'STUDY_SET_PUBLISHED'
  | 'POMODORO_CYCLE'
  | 'ADMIN_ADJUST';

/** Tiến độ một mệnh đề điều kiện mở huy hiệu (`criteria-evaluator`). */
export interface CriteriaProgressDto {
  counter: string;
  current: number;
  target: number;
}

export interface BadgeDto {
  id: string;
  code: string;
  name: string;
  description: string;
  emoji: string | null;
  iconAssetId: string | null;
  rarity: BadgeRarity;
  /** Có ⇔ đã mở. */
  unlockedAt?: string;
  seen?: boolean;
  progress?: CriteriaProgressDto[];
}

/** `GET /me/gamification` — ngưỡng cấp do server tính (client KHÔNG tự tính). */
export interface MyGamificationDto {
  xp: number;
  level: number;
  xpIntoLevel: number;
  /** 0 ở cấp tối đa. */
  xpToNext: number;
  levelSpan: number;
  streak: number;
  streakAtRisk: boolean;
  longestStreak: number;
  counters: Record<string, number>;
  showcase: BadgeDto[];
  unseenBadges: BadgeDto[];
  levelUpPending?: { from: number; to: number };
  serverNow: string;
}

export interface XpEventDto {
  id: string;
  sourceType: XpSourceType;
  xp: number;
  capped: boolean;
  blockedReason: string | null;
  occurredAt: string;
  workspaceId: string | null;
}

export interface XpEventsPage {
  data: XpEventDto[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatarAssetId: string | null;
  level: number;
  xp: number;
}

export interface LeaderboardDto {
  period: LeaderboardPeriod;
  from: string | null;
  to: string | null;
  entries: LeaderboardEntry[];
  me: { rank: number | null; xp: number; hidden: boolean };
  serverNow: string;
}

export interface SeenPayload {
  level?: number;
  badgeIds?: string[];
}

/**
 * `gamification:updated` → `user:{id}` (BE `GamificationUpdatedPayload`, `gamification.ports.ts`). ⚠️ KHÔNG mang
 * `xpIntoLevel`/`xpToNext`/`levelSpan` — ngưỡng cấp chỉ có ở `GET /me/gamification`, nên host tải lại sau mỗi sự kiện.
 */
export interface GamificationUpdatedPayload {
  xp: number;
  level: number;
  streak: number;
  levelUp?: { from: number; to: number };
  newBadges: NewBadgeSummary[];
}

/**
 * p7-02: BE phát THÊM một dạng `gamification:updated` chỉ mang `coins` (số dư ví đổi) — KHÔNG có `xp/level/streak`
 * (`coins.ports.ts`, be.md p7-02 §6). Host XP phải bỏ qua dạng này, không thì `patchProfile` ghi đè hồ sơ thành `undefined`.
 * Ví/cửa hàng tự đồng bộ lại bằng `GET /me/wallet` khi có màn hình (chưa có ở app).
 */
export interface CoinsUpdatedPayload {
  coins: { balance: number; delta: number; reason: string };
}

/** Mọi dạng payload của `gamification:updated`. */
export type GamificationSocketPayload = GamificationUpdatedPayload | CoinsUpdatedPayload;

export interface NewBadgeSummary {
  id: string;
  code: string;
  name: string;
  emoji: string | null;
}

/**
 * Vật phẩm hồ sơ đang trang bị (p7-02 chợ xu — khung avatar/theme/gói emoji) trả kèm hồ sơ công khai. Khai LẠI ở đây (không import `features/coins`,
 * `feature-structure.md` cấm import chéo feature) — `kind`/`data` khớp `EquippedItemView` của BE (`coins/services/coins-presenter.ts`).
 */
export interface EquippedProfileItemDto {
  kind: 'AVATAR_FRAME' | 'PROFILE_THEME' | 'EMOJI_PACK';
  itemId: string;
  code: string;
  name: string;
  assetId: string | null;
  data: Record<string, unknown> | null;
}

/** `GET /users/:id/gamification/public` — người CHUNG nhóm và không tắt `showGamification` (khác → 404 trung tính). */
export interface PublicGamificationDto {
  userId: string;
  name: string;
  avatarAssetId: string | null;
  level: number;
  streak: number;
  showcase: BadgeDto[];
  /** COIN-07 (p7-02 P1): khung avatar/theme/emoji người này đang trang bị — rỗng khi cờ `coins` tắt hoặc không trang bị gì. */
  equippedItems: EquippedProfileItemDto[];
}

/** `PATCH /me/privacy` — BE trả cả bốn công tắc đã gộp (`UserService.updatePrivacy`), mặc định `true`. */
export interface GamificationPrivacy {
  readReceipts: boolean;
  showPresence: boolean;
  showInLeaderboard: boolean;
  showGamification: boolean;
}

/** Thân `PATCH /me/privacy` — BE đòi ÍT NHẤT một trường; ở đây chỉ gửi hai công tắc của gamification. */
export type GamificationPrivacyPatch = Partial<
  Pick<GamificationPrivacy, 'showGamification' | 'showInLeaderboard'>
>;
