import { LeaderboardScreen } from '@/features/gamification';
import { FeatureRouteGuard } from '@/shell/capabilities';

/** Bảng xếp hạng nhóm (p4-03). Nằm trong `[wsId]/` nên `_layout` lo mất quyền. */
export default function WorkspaceLeaderboardRoute() {
  return (
    <FeatureRouteGuard flag="gamification">
      <LeaderboardScreen />
    </FeatureRouteGuard>
  );
}
