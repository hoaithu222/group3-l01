import { XpHistoryScreen } from '@/features/gamification';
import { FeatureRouteGuard } from '@/shell/capabilities';

/** Lịch sử điểm kinh nghiệm (p4-03, P1). */
export default function XpHistoryRoute() {
  return (
    <FeatureRouteGuard flag="gamification">
      <XpHistoryScreen />
    </FeatureRouteGuard>
  );
}
