import type {
  CoinsUpdatedPayload,
  GamificationSocketPayload,
  GamificationUpdatedPayload,
  MyGamificationDto,
  NewBadgeSummary,
} from '../api/gamification.types';

/** Một lần lên cấp chờ hiện trong `LevelUpModal`; `badges` = huy hiệu mở cùng lúc (cùng sự kiện). */
export interface LevelUpItem {
  badges: NewBadgeSummary[];
  from: number;
  to: number;
}

/**
 * Route mà `GamificationEventHost` HOÃN modal/toast tới khi rời đi (app.md p4-03 §7): đang làm bài thi thử (đồng hồ
 * đang chạy), đang gọi/họp, đang chơi live quiz (`/study/live/<id>` — KHÔNG gồm `join|host|history|<id>/results`).
 * ⚠️ Nhận diện theo đường dẫn (`usePathname()` đã bỏ nhóm `(app)`); route mới cần hoãn thì thêm vào đây.
 */
const DEFERRED_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/study\/attempts\//,
  /^\/call\//,
  /^\/meetings\/[^/]+\/room(\/|$)/,
  /^\/study\/live\/(?!join$|host$|history$)[^/]+\/?$/,
];

export function isDeferredRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return DEFERRED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * Vá `xp`/`level`/`streak` từ sự kiện vào hồ sơ đã cache. ⚠️ Sự kiện KHÔNG có `xpIntoLevel`/`xpToNext`/`levelSpan`
 * (ngưỡng cấp chỉ server tính) — host tải lại `me` ngay sau đó; vá trước chỉ để số XP/cấp/chuỗi đổi tức thì.
 * `streakAtRisk` hạ về `false`: vừa có hoạt động nên chuỗi hôm nay đã an toàn.
 */
export function patchProfile(
  profile: MyGamificationDto,
  event: Pick<GamificationUpdatedPayload, 'level' | 'streak' | 'xp'>,
): MyGamificationDto {
  return {
    ...profile,
    level: event.level,
    longestStreak: Math.max(profile.longestStreak, event.streak),
    streak: event.streak,
    streakAtRisk: false,
    xp: event.xp,
  };
}

/** Sự kiện chỉ đổi số dư coin (p7-02) — không mang `xp/level/streak` nên KHÔNG được vá vào hồ sơ XP. */
export function isCoinsOnlyEvent(event: GamificationSocketPayload): event is CoinsUpdatedPayload {
  return !('xp' in event);
}

/** Sự kiện có `levelUp` ⇒ một mục cho `LevelUpModal` (kèm huy hiệu mới cùng lúc); không có ⇒ `null`. */
export function levelUpItemOf(event: GamificationUpdatedPayload): LevelUpItem | null {
  if (!event.levelUp) return null;
  return { badges: event.newBadges ?? [], from: event.levelUp.from, to: event.levelUp.to };
}

/**
 * Sau khi bấm "Tuyệt" (`seen { level }`): server chỉ TĂNG `levelUpSeenLevel` (kẹp ≤ cấp hiện tại) nên cache làm cùng
 * luật — hết chờ nếu đã xem tới mức `pending.to`, còn cấp cao hơn chưa xem thì co `from` lại.
 */
export function applySeenLevel(profile: MyGamificationDto, level: number): MyGamificationDto {
  const pending = profile.levelUpPending;
  if (!pending) return profile;
  const seen = Math.min(level, profile.level);
  if (seen >= pending.to) {
    const { levelUpPending: _cleared, ...rest } = profile;
    return rest;
  }
  return { ...profile, levelUpPending: { from: Math.max(pending.from, seen), to: pending.to } };
}

/**
 * GM-03 (đa thiết bị): sự kiện tới MỌI thiết bị nên máy nào cũng xếp modal; sau khi tải lại `me`, mục nào server
 * KHÔNG còn coi là chờ (`levelUpPending` mất, hoặc `from` đã ≥ cấp của mục — máy kia đã bấm "Tuyệt") thì bỏ khỏi
 * hàng đợi.
 */
export function reconcileQueue(queue: LevelUpItem[], fresh: MyGamificationDto): LevelUpItem[] {
  const seenLevel = fresh.levelUpPending?.from;
  const kept = seenLevel === undefined ? [] : queue.filter((item) => item.to > seenLevel);
  return kept.length === queue.length ? queue : kept;
}

/** Câu đọc cho trình đọc màn hình + tiêu đề modal. */
export function levelUpAnnouncement(level: number): string {
  return `Chúc mừng, bạn đã lên cấp ${level}`;
}
