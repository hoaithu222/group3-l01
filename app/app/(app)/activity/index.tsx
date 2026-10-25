import { ActivityScreen } from '@/features/activity/screens/ActivityScreen';
import { FeatureRouteGuard } from '@/shell/capabilities';

/** Hoạt động là phần của Communication Hub — cờ `communication` tắt thì hiện "chưa được bật" (p0-07). */
export default function ActivityRoute() {
  return (
    <FeatureRouteGuard flag="communication">
      <ActivityScreen />
    </FeatureRouteGuard>
  );
}
