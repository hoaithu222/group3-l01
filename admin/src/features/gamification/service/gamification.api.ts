/**
 * Đường dẫn admin gamification — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp
 * `be/src/modules/gamification/gamification.admin.routes.ts`; mọi route cần cờ `gamification`,
 * xem `gamification:view`, ghi `gamification:update` (lý do 10–500 + audit).
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const gamificationApi = {
  /** GET — `XpRule[]`; PUT `/:sourceType` — CAS `expectedVersion` (`RES_003`), `GAME_001`. */
  xpRules: '/admin/xp-rules',
  xpRule: (sourceType: string) => `/admin/xp-rules/${seg(sourceType)}`,
  /** GET `?page&limit&isActive&q` — kèm `unlockedCount`; POST tạo (`GAME_002`, `GAME_003`; `iconAssetId` → `ASSET_001…005`, `NOT_FOUND`). */
  badges: '/admin/badges',
  /** POST `{ criteria }` → `{ eligibleUsers }`. */
  badgePreview: '/admin/badges/preview',
  /** GET → một `BadgeAdminDto` (deep link ngăn kéo); PATCH — CAS `expectedVersion`, sửa/tắt/bật. */
  badge: (id: string) => `/admin/badges/${seg(id)}`,
  /** POST `{ reason }` → 202 `{ jobId }`. */
  badgeBackfill: (id: string) => `/admin/badges/${seg(id)}/backfill`,
  /** GET → `LevelConfigView`; PUT `{ base, maxLevel, expectedVersion, reason }` (`RES_003`, `GAME_005`). */
  levels: '/admin/gamification/levels',
  /** GET `?workspaceId&period=WEEK|MONTH|ALL` — đã lọc người tắt bảng xếp hạng. */
  leaderboard: '/admin/gamification/leaderboard',
  /**
   * GET → `{ url, expiresAt }` của ảnh huy hiệu (`iconAssetId`). BE cho đọc khi asset đã gắn `BADGE_ICON` (mọi người đăng nhập) hoặc là chính chủ
   * tải lên (ảnh vừa tải, chưa Lưu); không đọc được → 404 → giao diện rơi về emoji. Tải ảnh: `POST /assets { scope: 'BADGE' }` (`core/uploads`).
   */
  assetUrl: (assetId: string) => `/assets/${seg(assetId)}/url`,
  userOverview: (userId: string) => `/admin/users/${seg(userId)}/gamification`,
  /** POST `{ delta, reason }` + header `Idempotency-Key` → `{ xp, level }` (`GAME_004`). */
  userXpAdjust: (userId: string) => `/admin/users/${seg(userId)}/xp-adjust`,
  /** DELETE `{ reason }` → 204. */
  userBadge: (userId: string, badgeId: string) =>
    `/admin/users/${seg(userId)}/badges/${seg(badgeId)}`,
} as const;
