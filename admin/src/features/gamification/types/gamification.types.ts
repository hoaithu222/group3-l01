/**
 * Kiểu dữ liệu admin gamification (p4-03) — khớp `be/src/modules/gamification/dtos/admin.dto.ts`,
 * `services/badge-admin.service.ts` (`BadgeAdminDto`) và entity `XpRule`.
 */

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
  // p4-07 — buổi học lộ trình (BE `XP_SOURCE_TYPES`). Thiếu giá trị này từng làm tab "Luật XP" sập vì bảng nhãn không có khoá.
  | 'ROADMAP_LESSON'
  | 'ADMIN_ADJUST';

/** Nguồn có luật (BE `RULE_SOURCE_TYPES` — không có `ADMIN_ADJUST`). */
export type XpRuleSourceType = Exclude<XpSourceType, 'ADMIN_ADJUST'>;

export type BadgeRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

/** `GET /admin/xp-rules` — một dòng luật. */
export interface XpRule {
  id: string;
  sourceType: XpRuleSourceType;
  xp: number;
  dailyCap: number | null;
  countsForStreak: boolean;
  isActive: boolean;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

/** Phần sửa được của luật (không kèm CAS/lý do). */
export type XpRuleDraft = Pick<XpRule, 'xp' | 'dailyCap' | 'countsForStreak' | 'isActive'>;

/** `PUT /admin/xp-rules/:sourceType`. */
export interface UpdateXpRulePayload extends XpRuleDraft {
  sourceType: XpRuleSourceType;
  expectedVersion: number;
  reason: string;
}

/** `BadgeAdminDto`. */
export interface AdminBadge {
  id: string;
  code: string;
  name: string;
  description: string;
  emoji: string | null;
  iconAssetId: string | null;
  rarity: BadgeRarity;
  criteria: unknown;
  counters: string[];
  isActive: boolean;
  order: number;
  version: number;
  unlockedCount: number;
  createdAt: string;
  updatedAt: string;
}

/** `GET /admin/badges` query — `q` tìm theo TÊN (BE khớp không dấu, không phân biệt hoa/thường; bỏ trống = không lọc). */
export interface AdminBadgesParams {
  page: number;
  limit: number;
  isActive?: 'true' | 'false';
  q?: string;
}

/** `PATCH /admin/badges/:id` — mọi trường tuỳ chọn trừ CAS + lý do; `code` không đổi được. */
export interface PatchBadgePayload {
  id: string;
  expectedVersion: number;
  reason: string;
  name?: string;
  description?: string;
  emoji?: string | null;
  /** Id asset ảnh (scope `BADGE`, READY, do người đang lưu tải lên, chưa gắn nơi khác); `null` gỡ ảnh; bỏ trống = giữ nguyên. Lệch phiên bản → `RES_003`. */
  iconAssetId?: string | null;
  criteria?: unknown;
  rarity?: BadgeRarity;
  order?: number;
  isActive?: boolean;
}

/** `POST /admin/badges`. */
export interface CreateBadgePayload {
  code: string;
  name: string;
  description: string;
  emoji?: string;
  /** Xem `PatchBadgePayload.iconAssetId` — BE gắn `AssetLink BADGE_ICON` cùng transaction tạo huy hiệu. */
  iconAssetId?: string;
  criteria: unknown;
  rarity?: BadgeRarity;
  order?: number;
  reason: string;
}

/** `POST /admin/users/:id/xp-adjust`. */
export interface XpAdjustPayload {
  userId: string;
  delta: number;
  reason: string;
  idempotencyKey: string;
}

export interface XpAdjustResult {
  xp: number;
  level: number;
}

/** `summary` của `GET /admin/users/:id/gamification` (= `MyGamificationDto` BE, chỉ trường admin dùng). */
export interface UserGamificationSummary {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
  streak: number;
  longestStreak: number;
}

/** Huy hiệu người dùng đang/đã giữ — kể cả đã thu hồi (`revokedAt`). */
export interface UserBadgeHolding {
  id: string;
  code: string;
  name: string;
  emoji: string | null;
  iconAssetId: string | null;
  rarity: BadgeRarity;
  unlockedAt?: string;
  via: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface UserXpEvent {
  id: string;
  sourceType: XpSourceType;
  xp: number;
  capped: boolean;
  blockedReason: string | null;
  occurredAt: string;
  workspaceId: string | null;
  /** Tên nhóm (BE `AdminXpEventDto`); `null` khi sự kiện không thuộc nhóm nào hoặc nhóm không còn. */
  workspaceName: string | null;
}

export interface UserGamificationOverview {
  summary: UserGamificationSummary;
  badges: UserBadgeHolding[];
  xpEvents: UserXpEvent[];
  xpEventsMeta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

/** `GET|PUT /admin/gamification/levels` — `LevelConfigView` BE (`thresholdsPreview[i]` = XP tích luỹ để ở cấp i+1). */
export interface LevelConfigView {
  base: number;
  maxLevel: number;
  version: number;
  thresholdsPreview: number[];
}

/** `PUT /admin/gamification/levels` — CAS `expectedVersion` (SystemConfig) + lý do. */
export interface UpdateLevelsPayload {
  base: number;
  maxLevel: number;
  expectedVersion: number;
  reason: string;
}

/** BE `LEADERBOARD_PERIODS`. */
export type LeaderboardPeriod = 'WEEK' | 'MONTH' | 'ALL';

export interface LeaderboardParams {
  workspaceId: string;
  period: LeaderboardPeriod;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatarAssetId: string | null;
  level: number;
  xp: number;
  /** BE không trả (đã lọc người tắt bảng xếp hạng); nếu có `true` — client bỏ dòng (phòng lỗi BE, admin.md §4). */
  hidden?: boolean;
}

/** `GET /admin/gamification/leaderboard` — `LeaderboardResult` BE (đã lọc người tắt bảng xếp hạng). */
export interface AdminLeaderboard {
  period: LeaderboardPeriod;
  from: string | null;
  to: string | null;
  entries: LeaderboardEntry[];
  serverNow: string;
}

/** `GET /assets/:id/url` — URL ký, hết hạn ngắn (ảnh riêng tư ≤ 60 giây). */
export interface AssetUrl {
  url: string;
  expiresAt: string;
}

/** `POST /admin/badges/preview`. */
export interface BadgePreviewResult {
  eligibleUsers: number;
}

/** `POST /admin/badges/:id/backfill` → 202. */
export interface BadgeBackfillResult {
  jobId: string;
}

/** `DELETE /admin/users/:id/badges/:badgeId`. */
export interface RevokeUserBadgePayload {
  userId: string;
  badgeId: string;
  reason: string;
}
