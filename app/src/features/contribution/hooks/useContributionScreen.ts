import { useMemo } from 'react';

import { useConnectionState } from '@/core/socket';
import { useBreakpoint } from '@/shared/theme';
import { useFeature } from '@/shell/capabilities';

import { useHeatmap } from '../queries/activity.queries';
import { useContributionPeriods, useBoardMeta, useContributionReport } from '../queries/report.queries';
import { canEditBoard } from '../utils/board-access';
import { HEATMAP_WEEKS_PHONE, HEATMAP_WEEKS_TABLET, heatmapRange } from '../utils/heatmap-grid';
import { todayKeyIn } from '../utils/zoned-format';
import { useContributionParams } from './useContributionParams';
import { useContributionRealtime } from './useContributionRealtime';
import { useStaleRefetch } from './useStaleRefetch';

/**
 * Gom dữ liệu + quyền + trạng thái của màn đóng góp (app.md §4–§5) để `ContributionScreen` chỉ còn vẽ:
 *  · mở màn: `report(ALL)` + `periods` + `heatmap(cả bảng, 26 tuần)` SONG SONG (ba truy vấn độc lập, không đợi nhau — riêng biểu đồ đợi múi giờ của nhóm);
 *  · kỳ / thành viên biểu đồ / lượt xuất nằm trên URL (`useContributionParams`);
 *  · `canEdit` (nút "Đổi trọng số") = quyền sửa bảng của `myPermissions` VÀ bảng chưa lưu trữ VÀ đang online — thiếu một là chỉ đọc;
 *  · `stale` → tự tải lại MỘT lần sau 60 giây; realtime `board:updated` (đổi công thức) và thông báo xuất xong làm mới sớm.
 * Cờ phân hệ `project` tắt (`featureOff`) thì không gọi API nào.
 */
export function useContributionScreen() {
  const params = useContributionParams();
  const { boardId, heat, period } = params;
  const flag = useFeature('project');
  const enabled = flag !== false;
  const { isTablet } = useBreakpoint();
  const offline = useConnectionState() === 'offline';

  const meta = useBoardMeta(boardId, enabled);
  const report = useContributionReport(boardId, period, enabled);
  const periods = useContributionPeriods(boardId, enabled);

  const weeks = isTablet ? HEATMAP_WEEKS_TABLET : HEATMAP_WEEKS_PHONE;
  const timezone = report.data?.period.timezone ?? periods.data?.timezone ?? null;
  const range = useMemo(() => (timezone ? heatmapRange(todayKeyIn(timezone), weeks) : null), [timezone, weeks]);
  const heatmap = useHeatmap(boardId, heat, range, enabled);

  useStaleRefetch(Boolean(report.data?.stale), `${boardId}|${period}`, report.refetch);
  useContributionRealtime(boardId, params.exportId);

  const archived = Boolean(meta.data?.archivedAt);

  return {
    ...params,
    archived,
    boardName: meta.data?.name,
    canEdit: !archived && !offline && canEditBoard(meta.data?.myPermissions),
    featureOff: flag === false,
    heatmap,
    offline,
    periods,
    range,
    refresh: () => {
      void report.refetch();
      void periods.refetch();
      void meta.refetch();
      if (range) void heatmap.refetch();
    },
    report,
    tablet: isTablet,
    timezone,
    weeks,
  };
}
