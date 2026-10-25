/**
 * Đường dẫn endpoint gamification (p4-03 be.md; `be/src/modules/gamification/gamification.routes.ts`) — nối sau
 * `appConfig.apiBaseUrl`. Mọi route BE đều sau `requireFeature(gamification)` ⇒ cờ tắt trả 404.
 */
export const ME_GAMIFICATION_PATH = '/me/gamification';
export const ME_GAMIFICATION_SEEN_PATH = '/me/gamification/seen';
export const ME_XP_EVENTS_PATH = '/me/xp-events';
export const BADGES_PATH = '/badges';
export const ME_BADGE_SHOWCASE_PATH = '/me/badges/showcase';
export const workspaceLeaderboardPath = (workspaceId: string) =>
  `/workspaces/${workspaceId}/leaderboard`;

/** Hồ sơ công khai của người CHUNG nhóm (P1). */
export const publicGamificationPath = (userId: string) => `/users/${userId}/gamification/public`;

/**
 * `PATCH /me/privacy` — cùng đường dẫn với `AUTH_ENDPOINTS.PRIVACY` (p0-01). Khai lại vì `authService.updatePrivacy`
 * chỉ biết hai công tắc `readReceipts`/`showPresence`; hai công tắc gamification (`showInLeaderboard`,
 * `showGamification`) có kiểu riêng ở feature này.
 */
export const ME_PRIVACY_PATH = '/me/privacy';
