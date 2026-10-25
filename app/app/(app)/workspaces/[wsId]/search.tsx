import { WorkspaceSearchScreen } from '@/features/workspace-search';
import { FeatureRouteGuard } from '@/shell/capabilities';

/**
 * Tìm toàn nhóm (p5-04): `?q=` điền sẵn từ khoá, `?type=messages|files|channels|people|meetings` mở đúng tab. Nằm trong
 * `[wsId]/` nên `_layout` lo mất quyền vào nhóm; cờ phụ `workspaceSearch` tắt → màn "tính năng chưa được bật".
 */
export default function WorkspaceSearchRoute() {
  return (
    <FeatureRouteGuard flag="workspaceSearch">
      <WorkspaceSearchScreen />
    </FeatureRouteGuard>
  );
}
