import { router } from 'expo-router';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { useFeature } from '@/shell/capabilities';

import { workspaceActivityHref } from '../utils/contribution-routes';

export interface WorkspaceActivityLinkProps {
  wsId: string;
}

/**
 * Lối vào "Hoạt động của nhóm" (p4-06, heatmap gộp mọi bảng) ở ĐẦU danh sách bảng của nhóm — MỌI thành viên thấy (biểu đồ chỉ đọc, khách bị BE chặn 404 và vốn không
 * tới được danh sách bảng). Hiện qua khe `@/shared/board-extensions` (`register.tsx`) nên `boards` không import feature này. Cờ phân hệ `project` tắt thì ẩn.
 * Một dòng bấm được (cùng khuôn `BoardsHubCard`): icon + tên + mô tả + mũi tên.
 */
export function WorkspaceActivityLink({ wsId }: WorkspaceActivityLinkProps) {
  const enabled = useFeature('project');
  if (enabled === false) return null;

  return (
    <Card>
      <ListItem
        className="items-center"
        description="Biểu đồ theo ngày, gộp mọi bảng của nhóm"
        emphasis="title"
        label="Hoạt động của nhóm"
        leading={<IconTile name="chart-1" tone="info" />}
        trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
        onPress={() => router.push(workspaceActivityHref(wsId))}
      />
    </Card>
  );
}
