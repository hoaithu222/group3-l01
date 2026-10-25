import { PomodoroHistoryScreen } from '@/features/pomodoro';
import { FeatureRouteGuard } from '@/shell/capabilities';

/** Lịch sử học Pomodoro cá nhân (p5-02, P1). Cờ `pomodoro` tắt ⇒ `FeatureOffScreen`. */
export default function PomodoroHistoryRoute() {
  return (
    <FeatureRouteGuard flag="pomodoro">
      <PomodoroHistoryScreen />
    </FeatureRouteGuard>
  );
}
