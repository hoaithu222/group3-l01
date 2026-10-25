import { router } from 'expo-router';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { useFeature } from '@/shell/capabilities';

import { useWorkspaceAccess } from '../queries/workspace-access.queries';
import { resourcesRootHref } from '../utils/resource-routes';

export interface ResourcesHubCardProps {
  wsId: string;
}

/**
 * Mục "Tài liệu" cho hub workspace — TỰ CHỨA: tự đọc cờ, vai trò, điều hướng; nơi
 * gắn chỉ cần `<ResourcesHubCard wsId={wsId} />` (p3-01 README §5, `WorkspaceOverviewScreen`
 * do p1-01 sở hữu nên card được xuất từ `features/resources/index.ts`).
 *
 * Ẩn khi cờ phân hệ `project` chưa bật (`undefined` lúc capabilities còn đang tải
 * cũng ẩn — vẽ rồi giấu đi là chớp nhoáng) và với GUEST (BE trả 404, P2 mới có
 * thư mục chỉ định). ⚠️ Đây là lọc để HIỂN THỊ; hàng rào thật ở BE.
 *
 * Đây là chỗ DUY NHẤT còn đọc `myRole`: `GET /workspaces/:id` (`myPermissions`) chưa có
 * cờ "được xem kho tài liệu" nên chưa có gì thay thế — còn mở với BE (báo cáo reconcile-p3-01).
 */
export function ResourcesHubCard({ wsId }: ResourcesHubCardProps) {
  const projectEnabled = useFeature('project');
  const { data } = useWorkspaceAccess(wsId);

  if (projectEnabled !== true || !data || data.myRole === 'GUEST') return null;

  // ✅ MỘT dòng bấm được có mũi tên `›` (cả dòng là vùng chạm) thay cho "mô tả + nút [Mở]": thẻ dẫn tới màn khác không cần
  // một nút riêng cho việc đó — cùng mẫu với `ModerationHubCard`.
  return (
    <Card title="Tài liệu">
      <ListItem
        className="items-center"
        description="Slide, giáo trình và mã mẫu của nhóm"
        emphasis="title"
        label="Kho tài liệu"
        leading={<IconTile name="document" tone="warning" />}
        trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
        onPress={() => router.push(resourcesRootHref(wsId))}
      />
    </Card>
  );
}
