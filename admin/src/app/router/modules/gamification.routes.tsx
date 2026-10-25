import type { ModuleConfig } from './types';

/** Gamification — luật XP, huy hiệu, cấp độ, bảng xếp hạng (Phase 3+). */
export const gamificationModule: ModuleConfig = {
  id: 'gamification',
  path: '/gamification',
  title: 'Gamification',
  iconName: 'star-outline',
  color: 'yellow',
  order: 60,
  featureFlag: 'gamification',
  tabTitles: {
    'xp-rules': 'Luật XP',
    badges: 'Huy hiệu',
    levels: 'Cấp độ',
    leaderboard: 'Xếp hạng',
    // p5-01: chỉ hiện khi cờ `live-quiz` bật (`GamificationPage`) — giám sát phiên thi đấu trực tiếp, kết thúc khẩn cấp.
    'live-quiz': 'Thi đấu trực tiếp',
    // p7-02: chỉ hiện khi cờ `coins` bật (`GamificationPage`) — số dư ví, cửa hàng, quy tắc thưởng, nhiệm vụ ngày.
    economy: 'Kinh tế xu',
    // p7-03: chỉ hiện khi cờ `burnout` bật (`GamificationPage`) — số liệu ẨN DANH tổng hợp + bộ luật đánh giá; KHÔNG có màn hình theo người dùng.
    wellbeing: 'Sức khoẻ học tập',
  },
  defaultTab: 'xp-rules',
  page: { lazy: () => import('@/features/gamification/pages/GamificationPage') },
  routes: [
    {
      // Deep link tới ngăn kéo huy hiệu — chuyển về `/gamification?tab=badges&badgeId=` (giữ danh sách phía sau), như `/user/:id`.
      path: 'badges/:badgeId',
      title: 'Chi tiết huy hiệu',
      hideInMenu: true,
      lazy: () => import('@/features/gamification/pages/BadgeDetailRedirectPage'),
    },
  ],
};
