import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { useConnectionState } from '@/core/socket';
import { useBreakpoint } from '@/shared/theme';
import { useFeature } from '@/shell/capabilities';

import { FALLBACK_TIMEZONE } from '../constants/contribution.constants';
import { useWorkspaceHeatmap, useWorkspaceMembers, useWorkspaceTimezone } from '../queries/activity.queries';
import { HEATMAP_WEEKS_PHONE, HEATMAP_WEEKS_TABLET, heatmapRange } from '../utils/heatmap-grid';
import { todayKeyIn } from '../utils/zoned-format';

/**
 * Gom dữ liệu + trạng thái của màn "Hoạt động của nhóm" (p4-06, `GET /workspaces/:id/activity-heatmap`) để `WorkspaceActivityScreen` chỉ còn vẽ:
 * múi giờ nhóm (`effectiveTimezone`) → khoảng ngày (26 tuần điện thoại / 52 máy tính bảng) → heatmap, cùng lúc tải danh sách thành viên cho bộ chọn.
 * Phạm vi (`heat`) là state cục bộ: `'all'` = cả nhóm, hoặc id một thành viên. Cờ phân hệ `project` tắt (`featureOff`) thì không gọi API nào.
 *
 * Đọc múi giờ lỗi (mất mạng, chi tiết nhóm 4xx) thì rơi về múi giờ mặc định của hệ thống để biểu đồ vẫn vẽ — quyền xem do CHÍNH endpoint heatmap quyết
 * (khách/người ngoài → 404 → màn hiện "không còn xem được"), không suy từ vai trò ở đây.
 */
export function useWorkspaceActivityScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const flag = useFeature('project');
  const enabled = flag !== false;
  const { isTablet } = useBreakpoint();
  const offline = useConnectionState() === 'offline';
  const [heat, setHeat] = useState('all');

  const workspace = useWorkspaceTimezone(wsId, enabled);
  const members = useWorkspaceMembers(wsId, enabled);

  const weeks = isTablet ? HEATMAP_WEEKS_TABLET : HEATMAP_WEEKS_PHONE;
  const settled = workspace.isSuccess || workspace.isError;
  const timezone = workspace.data?.effectiveTimezone ?? (settled ? FALLBACK_TIMEZONE : null);
  const range = useMemo(() => (timezone ? heatmapRange(todayKeyIn(timezone), weeks) : null), [timezone, weeks]);
  const heatmap = useWorkspaceHeatmap(wsId, heat, range, enabled);

  const options = useMemo(
    () => (members.data ?? []).map((member) => ({ label: member.displayName || member.name, value: member.userId })),
    [members.data],
  );

  return {
    featureOff: flag === false,
    heat,
    heatmap,
    offline,
    options,
    range,
    refresh: () => {
      void workspace.refetch();
      void members.refetch();
      if (range) void heatmap.refetch();
    },
    setHeat,
    tablet: isTablet,
    weeks,
  };
}
