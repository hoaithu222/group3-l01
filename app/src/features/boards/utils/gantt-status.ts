import type { GanttEdgeDto, GanttTaskDto } from '../api/critical-path.types';

export type GanttStatusKind = 'blocked' | 'conflict' | 'critical' | 'done';

export interface GanttStatus {
  kind: GanttStatusKind;
  label: string;
}

/** Thẻ TRƯỚC của từng thẻ, theo cạnh trả về từ BE (`GanttDto.edges`). */
export function buildPredecessorMap(edges: readonly GanttEdgeDto[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    map.set(edge.successorId, [...(map.get(edge.successorId) ?? []), edge.predecessorId]);
  }
  return map;
}

export interface GanttStatusContext {
  predecessors: ReadonlyMap<string, readonly string[]>;
  tasksById: ReadonlyMap<string, GanttTaskDto>;
}

/**
 * Nhãn trạng thái (icon + CHỮ, app.md §7) của một thẻ: "Xung đột lịch", "Đường găng", "Bị chặn bởi A (chưa xong)",
 * "Hoàn thành". Tên thẻ trước tra từ chính dữ liệu Gantt — thẻ trước nằm NGOÀI khoảng ngày đang xem thì không có tên,
 * rơi về "Bị chặn bởi N thẻ chưa xong" (số này BE luôn có). Thẻ đã xong không còn "bị chặn".
 */
export function ganttStatuses(task: GanttTaskDto, context: GanttStatusContext): GanttStatus[] {
  const items: GanttStatus[] = [];
  if (task.conflict) items.push({ kind: 'conflict', label: 'Xung đột lịch' });
  if (task.isCritical) items.push({ kind: 'critical', label: 'Đường găng' });

  if (task.columnKind === 'DONE') {
    items.push({ kind: 'done', label: 'Hoàn thành' });
  } else if (task.blockedByCount > 0) {
    const open = (context.predecessors.get(task.id) ?? [])
      .map((id) => context.tasksById.get(id))
      .filter((item): item is GanttTaskDto => item !== undefined && item.columnKind !== 'DONE');
    const [first] = open;
    items.push({
      kind: 'blocked',
      label: first
        ? `Bị chặn bởi ${first.title} (chưa xong)${open.length > 1 ? ` và ${open.length - 1} thẻ khác` : ''}`
        : `Bị chặn bởi ${task.blockedByCount} thẻ chưa xong`,
    });
  }
  return items;
}
