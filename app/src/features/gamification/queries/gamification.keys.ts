import type { LeaderboardPeriod } from '../api/gamification.types';

/** Khoá cache gamification (app.md p4-03 §4). Đăng xuất: xoá `gamificationKeys.all`. */
export const gamificationKeys = {
  all: ['gamification'] as const,
  me: () => ['gamification', 'me'] as const,
  badges: () => ['gamification', 'badges'] as const,
  /** Tiền tố của MỌI bảng xếp hạng (mọi nhóm, mọi kỳ) — để làm mới cùng lúc khi đổi riêng tư. */
  leaderboards: () => ['gamification', 'leaderboard'] as const,
  leaderboard: (wsId: string, period: LeaderboardPeriod) =>
    ['gamification', 'leaderboard', wsId, period] as const,
  publicProfile: (userId: string) => ['gamification', 'public', userId] as const,
  xpEvents: () => ['gamification', 'xp-events'] as const,
  /** Sự kiện XP của 7 ngày gần nhất (gom nhiều trang) cho khối thống kê Trang chủ — khoá RIÊNG, không phải `InfiniteData`. */
  xpEventsWeek: () => ['gamification', 'xp-events', 'week'] as const,
};
