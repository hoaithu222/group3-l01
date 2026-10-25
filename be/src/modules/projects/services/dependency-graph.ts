/**
 * Đồ thị phụ thuộc thẻ (p4-04 be.md §5.1) — THUẦN, không I/O trực tiếp: nhận hàm tải cạnh ra theo lô để BFS.
 * Đếm số cạnh đã duyệt; vượt `visitMax` → `DependencyGraphTooLargeError` (service đổi thành `TASK_021`).
 */
export interface DependencyEdge {
  predecessorId: string;
  successorId: string;
}

export type LoadOutgoing = (predecessorIds: string[], limit: number) => Promise<DependencyEdge[]>;

export class DependencyGraphTooLargeError extends Error {
  constructor(readonly visited: number) {
    super(`Đồ thị phụ thuộc vượt ${visited} cạnh`);
    this.name = "DependencyGraphTooLargeError";
  }
}

/**
 * Tìm một đường `from ⇝ to` theo chiều cạnh (predecessor → successor). Trả `[from, …, to]` hoặc `null`.
 * `from === to` → `[from]`. BFS theo lô: mỗi vòng MỘT lần tải cạnh ra của cả tầng (`frontier`).
 */
export async function findPath(from: string, to: string, loadOutgoing: LoadOutgoing, visitMax: number): Promise<string[] | null> {
  if (from === to) return [from];
  const parent = new Map<string, string | null>([[from, null]]);
  let frontier = [from];
  let visited = 0;

  while (frontier.length > 0) {
    const edges = await loadOutgoing(frontier, visitMax - visited + 1);
    visited += edges.length;
    if (visited > visitMax) throw new DependencyGraphTooLargeError(visited);

    const next: string[] = [];
    for (const e of edges) {
      if (parent.has(e.successorId)) continue;
      parent.set(e.successorId, e.predecessorId);
      if (e.successorId === to) return rebuild(parent, to);
      next.push(e.successorId);
    }
    frontier = next;
  }
  return null;
}

function rebuild(parent: Map<string, string | null>, to: string): string[] {
  const path: string[] = [];
  let cur: string | null | undefined = to;
  while (cur) {
    path.push(cur);
    cur = parent.get(cur);
  }
  return path.reverse();
}
