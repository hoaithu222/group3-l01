import { AchievementsScreen } from '@/features/gamification';
import { FeatureRouteGuard } from '@/shell/capabilities';

/** Thành tích của tôi (p4-03): cấp, XP, chuỗi ngày, huy hiệu, trưng bày. Chỉ khi cờ `gamification` bật. */
export default function AchievementsRoute() {
  return (
    <FeatureRouteGuard flag="gamification">
      <AchievementsScreen />
    </FeatureRouteGuard>
  );
}
