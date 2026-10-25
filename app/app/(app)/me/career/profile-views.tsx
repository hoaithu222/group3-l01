import { ProfileViewsScreen } from '@/features/career';
import { FeatureRouteGuard } from '@/shell/capabilities';

/** Ai đã xem hồ sơ của tôi (BE `GET /me/profile-views`): doanh nghiệp đã xem hồ sơ Tìm việc, theo ngày. Chỉ khi cờ `career` bật. */
export default function ProfileViewsRoute() {
  return (
    <FeatureRouteGuard flag="career">
      <ProfileViewsScreen />
    </FeatureRouteGuard>
  );
}
