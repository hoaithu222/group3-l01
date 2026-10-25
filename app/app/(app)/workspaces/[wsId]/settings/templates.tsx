import { ApplyTemplateScreen } from '@/features/workspace-templates';
import { FeatureRouteGuard } from '@/shell/capabilities';

/**
 * Áp mẫu cho nhóm đã có (p5-04) — chỉ chủ nhóm/quản trị viên (màn tự kiểm `myRole`, BE chặn 403). Cờ phụ `workspaceTemplates`
 * tắt → màn "tính năng chưa được bật". Nằm trong `[wsId]/` nên `_layout` lo mất quyền vào nhóm.
 */
export default function ApplyTemplateRoute() {
  return (
    <FeatureRouteGuard flag="workspaceTemplates">
      <ApplyTemplateScreen />
    </FeatureRouteGuard>
  );
}
