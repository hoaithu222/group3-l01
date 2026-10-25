import { WorkspaceTemplateStep } from '@/features/workspace-templates';
import { CreateWorkspaceScreen } from '@/features/workspaces/screens/CreateWorkspaceScreen';

/**
 * Tạo nhóm. Bước CHỌN MẪU (p5-04) thuộc feature `workspace-templates` nên được nối ở đây qua slot — `workspaces` không import
 * chéo feature khác (feature-structure.md). Bước tự ẩn khi cờ phụ `workspaceTemplates` tắt hoặc chưa có mẫu nào.
 */
export default function CreateWorkspaceRoute() {
  return (
    <CreateWorkspaceScreen renderTemplateStep={(step) => <WorkspaceTemplateStep {...step} />} />
  );
}
