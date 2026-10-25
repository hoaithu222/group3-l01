/**
 * API công khai của feature gamification (p4-03) — route/shell import qua đây.
 *
 * Nơi lắp ráp (`app/(app)/_layout.tsx`) mount `GamificationEventHost` MỘT lần. Màn Tôi (`features/me`) không import
 * feature này: điều phối viên nối `LevelProgressBar` + `StreakFlame` vào thẻ hồ sơ qua shell/route (app.md p4-03 §1).
 */
export { AchievementsScreen } from './screens/AchievementsScreen';
export { LeaderboardScreen } from './screens/LeaderboardScreen';
export { XpHistoryScreen } from './screens/XpHistoryScreen';
export { GamificationEventHost } from './components/GamificationEventHost';
export { GamificationPrivacyCard } from './components/GamificationPrivacyCard';
export { LevelProgressBar } from './components/LevelProgressBar';
export { ProfileGamificationBlock } from './components/ProfileGamificationBlock';
export { PublicProfileSheet } from './components/PublicProfileSheet';
export { StreakFlame } from './components/StreakFlame';
export { gamificationKeys } from './queries/gamification.keys';
export { useMyGamification } from './queries/gamification.queries';
