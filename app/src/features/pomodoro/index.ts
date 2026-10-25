/**
 * Mặt tiền công khai của feature `pomodoro` (p5-02). Route kênh (`app/(app)/workspaces/[wsId]/channels/[chId]/index.tsx`) chọn `PomodoroRoomScreen` khi
 * `channel.type === 'POMODORO'` (bọc `FeatureRouteGuard flag="pomodoro"`); `app/(app)/me/pomodoro-history.tsx` trỏ `PomodoroHistoryScreen`. Đăng xuất:
 * `shell/session/wipe-steps.ts` gọi `resetPomodoroStores` (import thẳng file, giống các feature khác — không qua barrel này để không kéo cả màn vào `shell`).
 */
export { PomodoroHistoryScreen } from './screens/PomodoroHistoryScreen';
export { PomodoroRoomScreen } from './screens/PomodoroRoomScreen';
export type { PomodoroRoomScreenProps } from './screens/PomodoroRoomScreen';
