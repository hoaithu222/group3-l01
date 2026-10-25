import { AppError, ScopeNotFoundError } from "../../../core/exceptions";
import { sharesActiveWorkspace } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { localDate } from "../../../core/utils/local-date";
import { LIMITS } from "../../../core/constants/limits";
import type { EquippedItemView } from "../../coins/public";
import { emptyCounters, type UserGamification } from "../entities/gamification.interface";
import type { IBadgeRepository } from "../repositories/badge.repository.interface";
import type { IGamDirectory } from "../repositories/directory";
import type { IUserBadgeRepository } from "../repositories/user-badge.repository.interface";
import type { IUserGamificationRepository } from "../repositories/user-gamification.repository.interface";
import type { IXpEventRepository } from "../repositories/xp-event.repository.interface";
import { avatarUrlOf } from "../../../shared/media";
import { counterView, toBadgeDto, toXpEventDto, type BadgeDto } from "./gamification.presenter";
import { levelProgress } from "./level";
import type { LevelConfigService } from "./level-config.service";
import { viewStreak } from "./streak";

/** Cổng ĐỌC vật phẩm hồ sơ đang trang bị (`@modules/coins/public`, p7-02) — CHỈ phần `forUsers` (không kéo theo mua/trang bị). Tuỳ chọn: hồ sơ công khai vẫn hoạt động khi thiếu (module `coins` tắt/chưa nối dây ở test). */
export type EquippedItemsPort = { forUsers(userIds: readonly string[]): Promise<Map<string, EquippedItemView[]>> };

export interface MyGamificationDto {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
  /** XP cần cho cả cấp hiện tại (mẫu số thanh tiến độ); 0 khi đã tối đa. */
  levelSpan: number;
  streak: number;
  streakAtRisk: boolean;
  longestStreak: number;
  counters: UserGamification["counters"];
  showcase: BadgeDto[];
  unseenBadges: BadgeDto[];
  /** Có khi `level > levelUpSeenLevel` — app hiện `LevelUpModal` MỘT lần trên mọi thiết bị rồi `POST /me/gamification/seen`. */
  levelUpPending?: { from: number; to: number };
  serverNow: string;
}

export interface QueryDeps {
  users: IUserGamificationRepository;
  badges: IBadgeRepository;
  userBadges: IUserBadgeRepository;
  events: IXpEventRepository;
  directory: IGamDirectory;
  levels: LevelConfigService;
  /** Vắng mặt (test cũ/module `coins` chưa nối) → `equippedItems` trả mảng rỗng, KHÔNG lỗi. */
  equipped?: EquippedItemsPort;
  now?: () => Date;
}

const gameError = (code: typeof ErrorCode.GAME_006) => new AppError(ErrorMessages[code], 400, code);

/** Đọc gamification của CHÍNH người dùng + hồ sơ công khai (p4-03 be.md §4). Người chưa có hàng `UserGamification` = trạng thái khởi đầu (không ghi khi đọc). */
export class GamificationQueryService {
  constructor(private readonly d: QueryDeps) {}

  private clock(): Date {
    return this.d.now?.() ?? new Date();
  }

  private async load(userId: string): Promise<UserGamification> {
    const found = await this.d.users.find(userId);
    if (found) return found;
    const at = this.clock();
    return { id: "", userId, xp: 0, level: 1, streak: 0, lastActiveDate: null, streakTz: null, counters: emptyCounters(), showcaseBadgeIds: [], levelUpSeenLevel: 1, version: 0, createdAt: at, updatedAt: at };
  }

  async me(userId: string): Promise<MyGamificationDto> {
    const now = this.clock();
    const [g, cfg, who, owned] = await Promise.all([this.load(userId), this.d.levels.get(), this.d.directory.getTimezoneAndStatus(userId), this.d.userBadges.listByUser(userId)]);
    const view = viewStreak(g, localDate(now, who?.timezone ?? "Asia/Ho_Chi_Minh"));
    const progress = levelProgress(g.xp, g.level, cfg);
    const held = owned.filter((b) => b.revokedAt === null);
    const badges = new Map((await this.d.badges.findByIds(held.map((b) => b.badgeId))).map((b) => [b.id, b]));
    const byBadge = new Map(held.map((b) => [b.badgeId, b]));
    const dto = (id: string): BadgeDto[] => {
      const b = badges.get(id);
      return b ? [toBadgeDto(b, byBadge.get(id))] : [];
    };
    return {
      xp: g.xp,
      level: progress.level,
      xpIntoLevel: progress.xpIntoLevel,
      xpToNext: progress.xpToNext,
      levelSpan: progress.levelSpan,
      streak: view.streak,
      streakAtRisk: view.atRisk,
      longestStreak: g.counters.longestStreak,
      counters: g.counters,
      showcase: g.showcaseBadgeIds.filter((id) => byBadge.has(id)).flatMap(dto),
      unseenBadges: held.filter((b) => b.seenAt === null).flatMap((b) => dto(b.badgeId)),
      ...(g.level > g.levelUpSeenLevel && { levelUpPending: { from: g.levelUpSeenLevel, to: g.level } }),
      serverNow: now.toISOString(),
    };
  }

  /** Đánh dấu đã xem cấp/huy hiệu (đồng bộ mọi thiết bị) — chỉ TĂNG `levelUpSeenLevel`, kẹp ≤ cấp hiện tại. */
  async seen(userId: string, dto: { level?: number; badgeIds?: string[] }): Promise<void> {
    if (dto.badgeIds && dto.badgeIds.length > 0) await this.d.userBadges.markSeen(userId, dto.badgeIds, this.clock());
    if (dto.level === undefined) return;
    for (let i = 0; i < 3; i += 1) {
      const g = await this.d.users.find(userId);
      if (!g || g.levelUpSeenLevel >= Math.min(dto.level, g.level)) return;
      if (await this.d.users.updateIf(userId, g.version, { levelUpSeenLevel: Math.min(dto.level, g.level) })) return;
    }
  }

  async xpEvents(userId: string, query: { cursor?: string; limit: number }) {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = Math.min(query.limit, LIMITS.gamification.xpEventsPageMax);
    const rows = await this.d.events.listByUser(userId, { after: after ?? undefined, limit: limit + 1 });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { data: page.map(toXpEventDto), meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit } };
  }

  /** Danh mục huy hiệu (đang bật + đã mở) kèm tiến độ từng mệnh đề và thời điểm mở. */
  async catalog(userId: string): Promise<BadgeDto[]> {
    const [g, active, owned] = await Promise.all([this.load(userId), this.d.badges.listActive(), this.d.userBadges.listByUser(userId)]);
    const held = new Map(owned.filter((b) => b.revokedAt === null).map((b) => [b.badgeId, b]));
    const activeIds = new Set(active.map((b) => b.id));
    const extra = await this.d.badges.findByIds([...held.keys()].filter((id) => !activeIds.has(id)));
    const counters = counterView(g.counters, g.level);
    return [...active, ...extra].map((b) => toBadgeDto(b, held.get(b.id), counters));
  }

  /** Chọn ≤ `showcaseMax` huy hiệu ĐÃ MỞ để trưng bày (`GAME_006` nếu chọn huy hiệu chưa mở/đã thu hồi). */
  async setShowcase(userId: string, badgeIds: string[]): Promise<{ showcase: BadgeDto[] }> {
    const ids = [...new Set(badgeIds)];
    if (ids.length > LIMITS.badge.showcaseMax) throw gameError(ErrorCode.GAME_006);
    const owned = new Map((await this.d.userBadges.listByUser(userId)).filter((b) => b.revokedAt === null).map((b) => [b.badgeId, b]));
    if (ids.some((id) => !owned.has(id))) throw gameError(ErrorCode.GAME_006);
    await this.d.users.ensure(userId);
    for (let i = 0; i < 3; i += 1) {
      const g = await this.d.users.find(userId);
      if (g && (await this.d.users.updateIf(userId, g.version, { showcaseBadgeIds: ids }))) break;
    }
    const badges = new Map((await this.d.badges.findByIds(ids)).map((b) => [b.id, b]));
    return {
      showcase: ids.flatMap((id) => {
        const b = badges.get(id);
        return b ? [toBadgeDto(b, owned.get(id))] : [];
      }),
    };
  }

  /**
   * Hồ sơ công khai (level, chuỗi, huy hiệu trưng bày) cho người CHUNG nhóm ACTIVE (P1). Không chung nhóm, tài khoản không hoạt động hoặc
   * `privacy.showGamification = false` → 404 trung tính (không lộ người đó tắt hay không tồn tại). `avatarUrl` = URL ảnh ký sẵn (THUMB)
   * dựng từ `avatarAssetId` (giữ nguyên trường cũ) — dùng thẳng làm nguồn ảnh.
   */
  async publicProfile(viewer: AuthUser, targetId: string) {
    if (viewer.id !== targetId && !(await sharesActiveWorkspace(viewer.id, targetId))) throw new ScopeNotFoundError();
    const target = (await this.d.directory.getUsers([targetId])).get(targetId);
    if (!target || target.status !== "ACTIVE" || (viewer.id !== targetId && !target.showGamification)) throw new ScopeNotFoundError();
    const mine = await this.me(targetId);
    const { name, avatarAssetId } = target;
    // Vật phẩm hồ sơ đang trang bị (khung avatar, theme, gói emoji — p7-02 P1 COIN-07): CHỈ ĐỌC qua `@modules/coins/public`, không phụ thuộc cờ `coins` ở tầng này (module coins tự ẩn nếu tắt — trả mảng rỗng).
    const equippedItems = (await this.d.equipped?.forUsers([targetId]))?.get(targetId) ?? [];
    return { userId: targetId, name, avatarAssetId, avatarUrl: avatarUrlOf(avatarAssetId), level: mine.level, streak: mine.streak, showcase: mine.showcase, equippedItems };
  }
}
