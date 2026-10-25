import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { boardGanttPath } from './critical-path.api';
import type { GanttDto, GanttRange } from './critical-path.types';

/**
 * `GET /boards/:id/gantt?from&to` (P1, be.md §5.7). Khoảng ≤ 366 ngày — vượt là `400`; ba mức chọn của màn
 * (2 tuần / tháng / quý) nằm trọn trong đó nên không cần kiểm lại ở đây.
 */
export const ganttService = {
  async get(boardId: string, range: GanttRange): Promise<GanttDto> {
    const response = await apiClient.get<GanttDto>(boardGanttPath(boardId), {
      params: { from: range.from, to: range.to },
      skipErrorToast: true,
    });
    const data = unwrapData<GanttDto>(response);
    return { ...data, edges: data.edges ?? [], tasks: data.tasks ?? [] };
  },
};
