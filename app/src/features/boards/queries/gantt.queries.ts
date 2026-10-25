import { useQuery } from '@tanstack/react-query';

import type { GanttRange } from '../api/critical-path.types';
import { ganttService } from '../api/gantt.service';
import { boardKeys } from './boards.keys';

/**
 * Dữ liệu Gantt của một khoảng ngày. `placeholderData` giữ biểu đồ cũ trong lúc đổi mức xem (2 tuần → tháng): trục
 * và thanh đứng yên tới khi khoảng mới về, không nháy về khung chờ. `staleTime` 15 s như danh sách thẻ.
 */
export function useGantt(boardId: string, range: GanttRange | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(boardId) && range !== null,
    placeholderData: (previous) => previous,
    queryFn: () => ganttService.get(boardId, range as GanttRange),
    queryKey: boardKeys.gantt(boardId, range ?? { from: '', to: '' }),
    staleTime: 15_000,
  });
}
