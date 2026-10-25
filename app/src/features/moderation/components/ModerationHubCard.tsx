import { router } from 'expo-router';

import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { useFeature } from '@/shell/capabilities';

import { useModerationPeek } from '../queries/reports.queries';

export interface ModerationHubCardProps {
  wsId: string;
}

/**
 * Lối vào "Báo cáo cần xử lý" ở tổng quan nhóm — TỰ CHỨA (cùng mẫu `ResourcesHubCard`): nơi ghép chỉ cần
 * `<ModerationHubCard wsId={wsId} />`. Ẩn khi cờ `communication` tắt, đang tải, hoặc BE trả 403 (tôi không
 * kiểm duyệt phạm vi nào trong nhóm này — ca BÌNH THƯỜNG của thành viên thường). Không dựa vào vai trò phía
 * app: MANAGER kênh riêng và OWNER/ADMIN nhóm chat cũng có hàng đợi dù không phải OWNER/ADMIN nhóm.
 * ⚠️ Đây là lọc để HIỂN THỊ; hàng rào thật ở BE (`PERM_001`).
 */
export function ModerationHubCard({ wsId }: ModerationHubCardProps) {
  const enabled = useFeature('communication') === true;
  const peek = useModerationPeek(wsId, enabled);

  if (!enabled || !peek.data) return null;

  const { data, meta } = peek.data;
  const count = data.length === 0 ? null : `${String(data.length)}${meta.hasMore ? '+' : ''}`;

  return (
    <Card title="Kiểm duyệt">
      {/* Ô icon khiên (tông `warning` = "cần để mắt") + số đang chờ là huy hiệu đặc — cùng khuôn hàng lối vào các thẻ tổng quan nhóm.
          Mũi tên `fg-2` (≥ 3:1) chứ không `fg-3` (2.96:1). */}
      <ListItem
        description={count ? 'Có báo cáo đang chờ bạn xem xét' : 'Chưa có báo cáo nào đang chờ'}
        emphasis="title"
        label="Báo cáo cần xử lý"
        leading={<IconTile name="shield-user" tone="warning" />}
        trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
        value={
          count ? (
            <Badge accessibilityLabel={`${count} báo cáo đang chờ`} appearance="solid" label={count} variant="error" />
          ) : undefined
        }
        onPress={() => router.push({ pathname: '/workspaces/[wsId]/reports', params: { wsId } })}
      />
    </Card>
  );
}
